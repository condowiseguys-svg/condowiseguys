import { RECORDS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Saves each finished pipeline step as JSON in the order-records bucket, written once.
 * A retried run reads the saved result instead of paying Claude to redo the step, and the
 * files stay as a record of what the report was based on.
 *
 * Paths: <order id>/analysis/s<submission>/<step>.json
 */
export function stepPath(orderId: string, submission: number, step: string) {
  return `${orderId}/analysis/s${submission}/${step}.json`;
}

export async function readStep<T>(path: string): Promise<T | null> {
  const { data, error } = await supabaseAdmin().storage.from(RECORDS_BUCKET).download(path);
  if (error || !data) return null;
  try {
    return JSON.parse(await data.text()) as T;
  } catch {
    return null;
  }
}

export async function writeStep(path: string, value: unknown) {
  const { error } = await supabaseAdmin()
    .storage.from(RECORDS_BUCKET)
    .upload(path, JSON.stringify(value), { contentType: "application/json", upsert: false });
  // Already saved by an earlier attempt: keep the first copy.
  if (error && !/exist|duplicate/i.test(error.message ?? "") && String((error as { statusCode?: unknown }).statusCode) !== "409") {
    throw error;
  }
}

/** Runs `compute` only if this step has no saved result yet. */
export async function cachedStep<T>(path: string, compute: () => Promise<T>): Promise<T> {
  const saved = await readStep<T>(path);
  if (saved !== null) return saved;
  const value = await compute();
  await writeStep(path, value);
  return value;
}
