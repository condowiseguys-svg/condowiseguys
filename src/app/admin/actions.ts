"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/admin-auth";
import { emailConfigured, emailHtml, sendEmailOnce } from "@/lib/ops/email";
import { logEvent, resolveIssues } from "@/lib/ops/events";
import { adminEmail } from "@/lib/ops/notify";
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
      .update({ status: "processing", processing_run_id: null, processing_started_at: null })
      .eq("id", orderId)
      .in("status", ["processing", "in_review"])
      .select("submission_count")
      .maybeSingle();
    if (!order) throw new Error("Only orders that are processing or waiting for your check can be re-run.");
    await resolveIssues({ orderId, kind: "processing_failed" }, "admin", "Processing re-run");
    await logEvent(orderId, "admin", "processing_rerun", {});
    await startProcessing(orderId, order.submission_count as number, `:rerun-${Date.now()}`);
  });
  done(orderId, "Processing restarted.");
}

/** Sends a test email to Brian's notification address and reports exactly what happened. */
export async function sendTestEmail() {
  await assertAdmin();
  let msg: string;
  if (!emailConfigured()) {
    msg = "Error: email isn't set up on the website. RESEND_API_KEY or EMAIL_FROM is missing in Vercel.";
  } else {
    const to = adminEmail();
    try {
      await sendEmailOnce({
        key: `test:${Date.now()}`,
        orderId: null,
        kind: "test",
        to,
        subject: "Test email from your Condo Wise Guys site",
        html: emailHtml(["This is a test. If you can read this, notification emails reach you."]),
        text: "This is a test. If you can read this, notification emails reach you.\n",
      });
      msg = `Sent a test email to ${to} from ${process.env.EMAIL_FROM}. Resend accepted it. If it doesn't arrive in a few minutes, check spam, then the Emails page in Resend for a bounce.`;
    } catch (err) {
      msg = `Error sending to ${to}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  revalidatePath("/admin");
  redirect(`/admin?msg=${encodeURIComponent(msg)}`);
}
