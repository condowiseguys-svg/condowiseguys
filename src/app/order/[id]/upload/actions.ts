"use server";

import { tasks } from "@trigger.dev/sdk";
import { getOrderWithToken } from "@/lib/orders";
import { DOCUMENTS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import type { processOrderTask } from "@/trigger/process-order";

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

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
  if (!order || order.status !== "paid") return { error: "This order can't accept uploads right now." };
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
  if (!order || order.status !== "paid") return { error: "This order can't accept uploads right now." };
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
  if (!order || order.status !== "paid" || !path.startsWith(`${order.id}/`)) return { error: "Not allowed." };
  const db = supabaseAdmin();
  await db.storage.from(DOCUMENTS_BUCKET).remove([path]);
  await db.from("order_documents").delete().eq("storage_path", path);
  return { ok: true as const };
}

/** Buyer is done uploading: lock the order and start the analysis job. */
export async function submitDocuments(orderId: string, token: string): Promise<{ ok: true } | { error: string }> {
  const order = await getOrderWithToken(orderId, token);
  if (!order || order.status !== "paid") return { error: "This order can't be submitted." };
  const db = supabaseAdmin();
  const { count } = await db
    .from("order_documents")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id);
  if (!count) return { error: "Please upload at least one document." };

  const { error } = await db
    .from("orders")
    .update({ status: "processing", submitted_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "paid");
  if (error) return { error: "Could not submit. Please try again." };

  if (process.env.TRIGGER_SECRET_KEY) {
    try {
      await tasks.trigger<typeof processOrderTask>("process-order", { orderId: order.id });
    } catch (err) {
      // The order is saved as processing; it can be re-queued from the dashboard later.
      console.error("Failed to start process-order", err);
    }
  }
  return { ok: true };
}
