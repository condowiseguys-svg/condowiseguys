import "server-only";

/** Which integrations have their environment variables set. */
export function integrationStatus() {
  return {
    supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    trigger: Boolean(process.env.TRIGGER_SECRET_KEY),
  };
}

export function orderingEnabled() {
  const s = integrationStatus();
  return s.supabase && s.stripe;
}

/** Absolute site URL for Stripe redirects. */
export function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
