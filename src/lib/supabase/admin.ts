import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DOCUMENTS_BUCKET = "strata-documents";
/** Permanent copies of approved reports and the exact documents they were based on. */
export const RECORDS_BUCKET = "order-records";

let client: SupabaseClient | null = null;

/**
 * Supabase client using the service role key, for the web server and Trigger.dev tasks.
 * Never import this from a client component.
 */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
