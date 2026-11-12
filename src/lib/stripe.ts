import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY || process.env.stripe_secret_key;
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY).");
  client = new Stripe(key);
  return client;
}

export function isStripeTestMode() {
  return (process.env.STRIPE_SECRET_KEY || process.env.stripe_secret_key || "").startsWith("sk_test_");
}
