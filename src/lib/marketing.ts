import "server-only";
import { logEvent, raiseIssue } from "@/lib/ops/events";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MARKETING_CONSENT_TEXT } from "@/lib/site";

/**
 * Records that a buyer ticked the opt-in box. Never throws and never blocks the order:
 * if the consent table isn't set up yet, the order still goes through and Brian gets an issue
 * on the dashboard (the event log keeps the fact that consent was given).
 */
export async function recordMarketingConsent(c: { orderId: string; email: string; name: string; source: string }) {
  const { error } = await supabaseAdmin().from("marketing_consents").insert({
    email: c.email,
    name: c.name || null,
    order_id: c.orderId,
    source: c.source,
    consent_text: MARKETING_CONSENT_TEXT,
  });
  await logEvent(c.orderId, "buyer", "marketing_consent_given", { source: c.source, saved: !error });
  if (error) {
    console.error("marketing consent insert failed", error);
    await raiseIssue({
      orderId: c.orderId,
      kind: "other",
      message:
        "The buyer opted in to DreamHomeGroup.ca emails, but the consent table is missing. Run database-setup/Step 6 - marketing consent.sql in Supabase.",
      dedupeKey: `marketing-consent:${c.orderId}`,
    });
  }
}

/** True if the buyer on this order opted in and hasn't withdrawn. False if unsure. */
export async function hasMarketingConsent(orderId: string) {
  const { data, error } = await supabaseAdmin()
    .from("marketing_consents")
    .select("id")
    .eq("order_id", orderId)
    .is("withdrawn_at", null)
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}
