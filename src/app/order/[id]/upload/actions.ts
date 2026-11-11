"use server";

import { logEvent, resolveIssues } from "@/lib/ops/events";
import { startProcessing } from "@/lib/ops/jobs";
import { getOrderWithToken, type OrderRow } from "@/lib/orders";
import { DOCUMENTS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

/** Orders the buyer can add files to: just paid, or we asked for more. */
function acceptsUploads(order: OrderRow | null): order is OrderRow {
  return !!order && (order.status === "paid" || order.status === "awaiting_documents");
}

function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_");
  return cleaned.slice(-120) || "document.pdf";
}

/** Returns a one-time signed URL so the browser uploads straight to Supabase Storage. */
export async function getUploadUrl(
  orderId: string,
  token: string,
  file: { name: string; size: number; type: string },
): Promise<{ path: string; signedUrl: string; token: string } | { error: string }> {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order)) return { error: "This order can't accept uploads right now." };
  if (!ALLOWED.includes(file.type)) return { error: `${file.name}: only PDF, JPG and PNG files are accepted.` };
  if (file.size > MAX_BYTES) return { error: `${file.name} is over 100 MB. Please split it or email us.` };

  const path = `${order.id}/${crypto.randomUUID()}-${safeName(file.name)}`;
  const { data, error } = await supabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Could not start the upload. Please try again." };
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** Records an uploaded file against the order after the browser finishes uploading it. */
export async function recordUpload(
  orderId: string,
  token: string,
  file: { path: string; name: string; size: number },
): Promise<{ ok: true } | { error: string }> {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order)) return { error: "This order can't accept uploads right now." };
  if (!file.path.startsWith(`${order.id}/`)) return { error: "Invalid file." };
  const { error } = await supabaseAdmin()
    .from("order_documents")
    .upsert(
      { order_id: order.id, storage_path: file.path, file_name: file.name.slice(0, 200), size_bytes: file.size },
      { onConflict: "storage_path" },
    );
  return error ? { error: "Could not save the file record." } : { ok: true };
}

export async function removeUpload(orderId: string, token: string, path: string) {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order) || !path.startsWith(`${order.id}/`)) return { error: "Not allowed." };
  const db = supabaseAdmin();
  const { data: doc } = await db
    .from("order_documents")
    .select("id, check_status")
    .eq("storage_path", path)
    .maybeSingle();
  // Once we've checked a readable file it stays with the order (it may be part of the record).
  if (doc && doc.check_status === "ok") return { error: "This file has already been received and can't be removed." };
  if (doc) {
    await resolveIssues({ orderId: order.id, documentId: doc.id as string }, "buyer", "Buyer removed the file");
    const { error } = await db.from("order_documents").delete().eq("id", doc.id);
    if (error) return { error: "Could not remove the file." };
  }
  await db.storage.from(DOCUMENTS_BUCKET).remove([path]);
  return { ok: true as const };
}

/** Buyer is done uploading: lock the order and start one processing job for this submission. */
export async function submitDocuments(orderId: string, token: string): Promise<{ ok: true } | { error: string }> {
  const order = await getOrderWithToken(orderId, token);
  if (!acceptsUploads(order)) return { error: "This order can't be submitted." };
  const db = supabaseAdmin();
  const { count } = await db
    .from("order_documents")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id)
    .neq("check_status", "unreadable")
    .neq("check_status", "empty");
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

  try {
    await startProcessing(order.id, submission as number);
  } catch (err) {
    // The order is saved as processing; the dashboard shows it as stuck and Brian can re-run it.
    console.error("Failed to start process-order", err);
  }
  return { ok: true };
}
