import "server-only";

/** Which integrations have their environment variables set. */
export function integrationStatus() {
  return {
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY || process.env.stripe_secret_key),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    trigger: Boolean(process.env.TRIGGER_SECRET_KEY),
  };
}

export function orderingEnabled() {
  const s = integrationStatus();
  return s.supabase && s.stripe;
}

export { siteUrl } from "@/lib/ops/urls";
