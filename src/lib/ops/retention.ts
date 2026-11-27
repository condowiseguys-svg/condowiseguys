import { logEvent, raiseIssue } from "@/lib/ops/events";
import { DOCUMENTS_BUCKET, RECORDS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Deletes customer information once it is past its retention date (decided 2026-11-19;
 * report period raised from 2 to 5 years on 2026-11-27 for professional record keeping):
 *  - 90 days after delivery: uploaded documents and draft reports, including the copies
 *    kept with the approved report.
 *  - 5 years after delivery: the approved report and record, and the buyer's personal
 *    details on the order (the order itself stays as an anonymous business record).
 * The database decides what is due (database-setup/Step 5 - retention.sql, changed to 5 years
 * by Step 9 - keep reports 5 years.sql) and refuses
 * to delete anything early, so this code can't remove a file before its date.
 */
export type RetentionResult = { orderId: string; stage: string; filesDeleted: number; erased: boolean; error?: string };

export async function runRetention(limit = 25): Promise<RetentionResult[]> {
  const db = supabaseAdmin();
  const { data: due, error } = await db.rpc("orders_due_for_retention", { p_limit: limit });
  if (error) throw new Error(`Retention check failed: ${error.message}`);

  const results: RetentionResult[] = [];
  for (const row of (due ?? []) as { order_id: string; stage: string }[]) {
    try {
      results.push(await purgeOrder(row.order_id, row.stage));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ orderId: row.order_id, stage: row.stage, filesDeleted: 0, erased: false, error: message });
      await raiseIssue({
        orderId: row.order_id,
        kind: "other",
        message: `Automatic deletion (${row.stage}) failed: ${message}`.slice(0, 500),
        dedupeKey: `retention-failed:${row.order_id}:${row.stage}`,
      });
    }
  }
  return results;
}

async function purgeOrder(orderId: string, stage: string): Promise<RetentionResult> {
  const db = supabaseAdmin();
  const { data: objects, error } = await db.rpc("order_storage_objects", { p_order_id: orderId });
  if (error) throw new Error(error.message);

  const files = (objects ?? []) as { bucket_id: string; name: string }[];
  // Documents stage: everything in the working bucket, and only the document copies in records.
  // All stage: everything in both buckets.
  const working = files.filter((f) => f.bucket_id === DOCUMENTS_BUCKET).map((f) => f.name);
  const records = files
    .filter((f) => f.bucket_id === RECORDS_BUCKET && (stage === "all" || f.name.includes("/documents/")))
    .map((f) => f.name);

  let filesDeleted = 0;
  for (const [bucket, names] of [[DOCUMENTS_BUCKET, working], [RECORDS_BUCKET, records]] as const) {
    for (let i = 0; i < names.length; i += 100) {
      const batch = names.slice(i, i + 100);
      const { data, error: rmErr } = await db.storage.from(bucket).remove(batch);
      if (rmErr) throw new Error(`${bucket}: ${rmErr.message}`);
      filesDeleted += data?.length ?? 0;
    }
  }

  const now = new Date().toISOString();
  const { error: upErr } = await db
    .from("orders")
    .update({ documents_purged_at: now })
    .eq("id", orderId)
    .is("documents_purged_at", null);
  if (upErr) throw new Error(upErr.message);

  let erased = false;
  if (stage === "all") {
    const { data, error: erErr } = await db.rpc("erase_order_personal_data", { p_order_id: orderId });
    if (erErr) throw new Error(erErr.message);
    erased = data === true;
  }

  await logEvent(orderId, "system", erased ? "personal_data_erased" : "documents_deleted", { files: filesDeleted });
  return { orderId, stage, filesDeleted, erased };
}
