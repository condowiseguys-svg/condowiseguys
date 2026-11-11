"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/admin-auth";
import { logEvent, resolveIssues } from "@/lib/ops/events";
import { startDelivery, startProcessing } from "@/lib/ops/jobs";
import { PACKAGE_ITEMS } from "@/lib/ops/package-checklist";
import { requestMissingDocuments } from "@/lib/ops/processing";
import { approveReportVersion, createReportVersion } from "@/lib/ops/records";
import { supabaseAdmin } from "@/lib/supabase/admin";

const MAX_REPORT_BYTES = 4 * 1024 * 1024;

function done(orderId: string, msg: string): never {
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin");
  redirect(`/admin/orders/${orderId}?msg=${encodeURIComponent(msg)}`);
}

async function guard<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
  await assertAdmin();
  try {
    return await fn();
  } catch (err) {
    done(orderId, `Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Brian uploads a finished report PDF (until the automatic report step exists). */
export async function uploadReport(orderId: string, form: FormData) {
  const file = form.get("report");
  const v = await guard(orderId, async () => {
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF first.");
    if (file.type !== "application/pdf") throw new Error("The report must be a PDF.");
    if (file.size > MAX_REPORT_BYTES) throw new Error("Reports over 4 MB can't be uploaded here yet.");
    return createReportVersion({ orderId, pdf: new Uint8Array(await file.arrayBuffer()), createdBy: "admin" });
  });
  done(orderId, `Saved as version ${v.version}. Review it, then approve and send.`);
}

export async function approveAndSend(orderId: string, versionId: string) {
  const result = await guard(orderId, async () => {
    const v = await approveReportVersion(versionId, "brian");
    return startDelivery(orderId, v.id);
  });
  done(orderId, result === "not_configured" ? "Approved and archived. Email isn't set up, so it wasn't sent." : "Approved, archived and sent to the buyer.");
}

export async function retryDelivery(orderId: string, versionId: string) {
  await guard(orderId, async () => {
    await resolveIssues({ orderId, kind: "delivery_failed" }, "admin", "Delivery retried");
    await startDelivery(orderId, versionId, `:retry-${Date.now()}`);
  });
  done(orderId, "Delivery retried.");
}

export async function discardDraft(orderId: string, versionId: string) {
  await guard(orderId, async () => {
    const { error } = await supabaseAdmin()
      .from("report_versions")
      .update({ status: "discarded" })
      .eq("id", versionId)
      .eq("status", "draft");
    if (error) throw error;
    await logEvent(orderId, "admin", "report_discarded", { versionId });
  });
  done(orderId, "Draft discarded.");
}

export async function resolveIssue(orderId: string, issueId: string, form: FormData) {
  const note = String(form.get("resolution") ?? "").trim() || "Resolved";
  await guard(orderId, () => resolveIssues({ orderId, id: issueId }, "admin", note.slice(0, 500)));
  done(orderId, "Issue resolved.");
}

export async function requestDocuments(orderId: string, form: FormData) {
  const picked = form.getAll("items").map(String);
  const labels = PACKAGE_ITEMS.filter((i) => picked.includes(i.id)).map((i) => i.label);
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  const moved = await guard(orderId, () => requestMissingDocuments(orderId, labels, note, "admin"));
  done(orderId, moved ? "Buyer asked for the documents." : "Saved, but the order wasn't in a state to ask the buyer.");
}

/** Starts a fresh processing run for a stuck or failed order. */
export async function rerunProcessing(orderId: string) {
  await guard(orderId, async () => {
    const db = supabaseAdmin();
    const { data: order } = await db
      .from("orders")
      .update({ processing_run_id: null, processing_started_at: null })
      .eq("id", orderId)
      .eq("status", "processing")
      .select("submission_count")
      .maybeSingle();
    if (!order) throw new Error("Only orders that are processing can be re-run.");
    await resolveIssues({ orderId, kind: "processing_failed" }, "admin", "Processing re-run");
    await logEvent(orderId, "admin", "processing_rerun", {});
    await startProcessing(orderId, order.submission_count as number, `:rerun-${Date.now()}`);
  });
  done(orderId, "Processing restarted.");
}
