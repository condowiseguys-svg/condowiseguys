"use server";

import { notifyAdmin } from "@/lib/ops/notify";
import { logEvent, resolveIssues } from "@/lib/ops/events";
import { startPrepare, startProcessing } from "@/lib/ops/jobs";
import { getOrderWithToken, type OrderRow } from "@/lib/orders";
import { DOCUMENTS_BUCKET, supabaseAdmin, supabaseOrigin } from "@/lib/supabase/admin";
import { loadUploadListing, type UploadListing } from "@/lib/uploads/listing";
import {
  CONTENT_TYPES,
  formatBytes,
  MAX_DOCUMENT_BYTES,
  MAX_FILE_BYTES,
  MAX_ORDER_BYTES,
  MAX_ORDER_FILES,
  uploadKind,
} from "@/lib/uploads/limits";
import { safeName } from "@/lib/uploads/prepare";

type Order = OrderRow & { submitted_at?: string | null };

/** Orders the buyer can add files to: just paid, or we asked for more. */
function acceptsUploads(order: OrderRow | null): order is Order {
  return !!order && (order.status === "paid" || order.status === "awaiting_documents");
}

/**
 * Supabase's resumable (TUS) upload address for signed uploads. Large files go to the direct
 * storage host, which Supabase recommends for big uploads; the browser falls back to the
 * main project address if that one can't be reached.
 */
function tusEndpoints() {
  const origin = supabaseOrigin(process.env.SUPABASE_URL);
  if (!origin) throw new Error("Supabase is not configured");
  const main = `${origin}/storage/v1/upload/resumable/sign`;
  const ref = new URL(origin).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  return ref ? [`https://${ref}.storage.supabase.co/storage/v1/upload/resumable/sign`, main] : [main];
}

export type UploadTicket =
  | { path: string; token: string; signedUrl: string; endpoints: string[]; contentType: string }
  | { path: string; alreadyUploaded: true }
  | { error: string };

/**
 * Lets the browser upload one file straight to Supabase Storage (never through our server).
 * The signed token only allows writing that one new path inside this order's folder, once.
 * Passing `resumePath` re-signs an upload that was interrupted, so it continues where it left off.
 */
export async function getUploadTicket(
  orderId: string,
  token: string,
  file: { name: string; size: number; resumePath?: string },
): Promise<UploadTicket> {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order)) return { error: "This order can't accept uploads right now." };
  const kind = uploadKind(file.name);
  if (!kind) return { error: `${file.name}: please upload PDF, ZIP, JPG or PNG files.` };
  const max = kind === "zip" ? MAX_FILE_BYTES : MAX_DOCUMENT_BYTES;
  if (file.size > max) return { error: `${file.name} is over ${formatBytes(max)}. Please split it, or contact us and we'll help.` };
  if (file.size === 0) return { error: `${file.name} is empty.` };

  const db = supabaseAdmin();
  const storage = db.storage.from(DOCUMENTS_BUCKET);

  if (file.resumePath) {
    const prefix = `${order.id}/`;
    const valid =
      file.resumePath.startsWith(prefix) && /^[0-9a-f-]{36}-[\w.\- ]+$/i.test(file.resumePath.slice(prefix.length));
    if (valid) {
      const { data: recorded } = await db.from("order_documents").select("id").eq("storage_path", file.resumePath).maybeSingle();
      const { data: info } = await storage.info(file.resumePath);
      if (recorded || info) return { path: file.resumePath, alreadyUploaded: true };
      const { data, error } = await storage.createSignedUploadUrl(file.resumePath);
      if (!error && data) {
        return { path: file.resumePath, token: data.token, signedUrl: data.signedUrl, endpoints: tusEndpoints(), contentType: CONTENT_TYPES[kind] };
      }
    }
    // Otherwise start a fresh upload below.
  }

  const { data: existing } = await db.from("order_documents").select("size_bytes").eq("order_id", order.id).is("parent_id", null);
  if ((existing?.length ?? 0) >= MAX_ORDER_FILES) return { error: "This order already has the most files we can take. Please contact us." };
  const total = (existing ?? []).reduce((n, d) => n + Number(d.size_bytes ?? 0), 0);
  if (total + file.size > MAX_ORDER_BYTES) {
    return { error: `Adding ${file.name} would take this order over ${formatBytes(MAX_ORDER_BYTES)}. Please contact us.` };
  }

  const path = `${order.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error || !data) return { error: "Could not start the upload. Please try again." };
  return { path, token: data.token, signedUrl: data.signedUrl, endpoints: tusEndpoints(), contentType: CONTENT_TYPES[kind] };
}

/** Records an uploaded file against the order once it is fully in storage, and starts checking it. */
export async function recordUpload(
  orderId: string,
  token: string,
  file: { path: string; name: string },
): Promise<{ ok: true; id: string } | { error: string }> {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order)) return { error: "This order can't accept uploads right now." };
  if (!file.path.startsWith(`${order.id}/`) || file.path.includes("/unpacked/")) return { error: "Invalid file." };
  const kind = uploadKind(file.name);
  if (!kind) return { error: "Invalid file." };

  const db = supabaseAdmin();
  // Trust what storage holds, not what the browser says.
  const { data: info, error: infoError } = await db.storage.from(DOCUMENTS_BUCKET).info(file.path);
  if (infoError || !info) return { error: "The upload did not finish. Please try again." };

  const { data, error } = await db
    .from("order_documents")
    .upsert(
      {
        order_id: order.id,
        storage_path: file.path,
        file_name: file.name.slice(0, 200),
        size_bytes: info.size ?? null,
        kind: kind === "zip" ? "archive" : "document",
      },
      { onConflict: "storage_path", ignoreDuplicates: true },
    )
    .select("id");
  let id = data?.[0]?.id as string | undefined;
  if (!id) {
    const { data: row } = await db.from("order_documents").select("id").eq("storage_path", file.path).maybeSingle();
    id = row?.id as string | undefined;
  }
  if (error || !id) return { error: "Could not save the file record." };
  await startPrepare(order.id, id);
  return { ok: true, id };
}

/** What the upload page shows; polled while files are being checked or unpacked. */
export async function listUploads(orderId: string, token: string): Promise<UploadListing | { error: string }> {
  const order = (await getOrderWithToken(orderId, token)) as Order | null;
  if (!order) return { error: "Order not found." };
  return loadUploadListing(order);
}

/** Removes a file the buyer added by mistake. A ZIP takes everything unpacked from it along. */
export async function removeUpload(orderId: string, token: string, documentId: string) {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order)) return { error: "Not allowed." };
  const db = supabaseAdmin();
  const { data: doc } = await db
    .from("order_documents")
    .select("id, order_id, created_at, storage_path, check_status, parent_id")
    .eq("id", documentId)
    .eq("order_id", order.id)
    .maybeSingle();
  if (!doc) return { ok: true as const };
  // Files from a submission we already received stay with the order (they may be part of the record).
  const { data: top } = doc.parent_id
    ? await db.from("order_documents").select("created_at, check_status").eq("id", doc.parent_id).maybeSingle()
    : { data: doc };
  const submittedAt = order.submitted_at ? new Date(order.submitted_at).getTime() : 0;
  if (submittedAt && top && new Date(top.created_at as string).getTime() <= submittedAt && top.check_status !== "unreadable") {
    return { error: "This file was part of your earlier submission and can't be removed." };
  }

  const { data: children } = await db.from("order_documents").select("id, storage_path").eq("parent_id", doc.id);
  const paths = [doc.storage_path as string, ...(children ?? []).map((c) => c.storage_path as string)];
  // Copies of what's being removed become the reviewed copy again (the final check at submit
  // keeps only one of each).
  const removedIds = [doc.id as string, ...(children ?? []).map((c) => c.id as string)];
  for (let i = 0; i < removedIds.length; i += 100) {
    const { data: open } = await db
      .from("order_issues")
      .select("id")
      .eq("order_id", order.id)
      .is("resolved_at", null)
      .in("document_id", removedIds.slice(i, i + 100));
    for (const issue of open ?? []) {
      await resolveIssues({ orderId: order.id, id: issue.id as string }, "buyer", "Buyer removed the file");
    }
    await db
      .from("order_documents")
      .update({ check_status: "ok", duplicate_of: null, check_detail: null })
      .eq("order_id", order.id)
      .eq("check_status", "duplicate")
      .in("duplicate_of", removedIds.slice(i, i + 100));
  }
  const { error } = await db.from("order_documents").delete().eq("id", doc.id); // children go with it
  if (error) return { error: "Could not remove the file." };
  for (let i = 0; i < paths.length; i += 100) await db.storage.from(DOCUMENTS_BUCKET).remove(paths.slice(i, i + 100));
  await logEvent(order.id, "buyer", "document_removed", { document: doc.id, files: paths.length });
  return { ok: true as const };
}

/** An upload the browser gave up on: tell Brian once, so a stuck buyer isn't missed. */
export async function reportUploadProblem(orderId: string, token: string, file: { name: string; size: number; message: string }) {
  const order = await getOrderWithToken(orderId, token);
  if (!order) return;
  await logEvent(order.id, "buyer", "upload_failed", { name: file.name.slice(0, 200), size: file.size, message: file.message.slice(0, 300) });
  await notifyAdmin({
    key: `upload-failed:${order.id}:${file.name.slice(0, 80)}:${file.size}`,
    orderId: order.id,
    subject: "A buyer couldn't upload a file",
    lines: [`${file.name} (${formatBytes(file.size)}) failed: ${file.message}`.slice(0, 400)],
  });
}

/** Buyer is done uploading: lock the order and start one processing job for this submission. */
export async function submitDocuments(orderId: string, token: string): Promise<{ ok: true } | { error: string }> {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order)) return { error: "This order can't be submitted." };
  const db = supabaseAdmin();
  const { count: unpacking } = await db
    .from("order_documents")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id)
    .eq("kind", "archive")
    .eq("check_status", "pending");
  if (unpacking) return { error: "We're still unpacking your ZIP files. Submit will be ready in a moment." };
  const { count } = await db
    .from("order_documents")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id)
    .in("check_status", ["pending", "ok"])
    .eq("kind", "document");
  if (!count) return { error: "Please upload at least one readable document." };

  // Atomic: only one submit wins, and it gets a new submission number.
  const { data: submission, error } = await db.rpc("submit_order", { p_order_id: order.id });
  if (error) return { error: "Could not submit. Please try again." };
  if (submission === null) return { ok: true }; // already submitted by another click

  await logEvent(order.id, "buyer", order.status === "paid" ? "documents_submitted" : "documents_resubmitted", {
    submission,
    documents: count,
  });
  await resolveIssues({ orderId: order.id, buyerVisibleOnly: true }, "buyer", "Buyer resubmitted documents");
  await notifyAdmin({
    key: `submitted:${order.id}:${submission}`,
    orderId: order.id,
    subject: order.status === "paid" ? "Documents received" : "Documents resubmitted",
    lines: [`${count} document${count === 1 ? "" : "s"} uploaded. Processing has started.`],
  });

  try {
    await startProcessing(order.id, submission as number);
  } catch (err) {
    // The order is saved as processing; the dashboard shows it as stuck and Brian can re-run it.
    console.error("Failed to start process-order", err);
  }
  return { ok: true };
}
