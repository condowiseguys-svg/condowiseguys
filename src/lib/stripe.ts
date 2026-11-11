import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeIsTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured: set STRIPE_SECRET_KEY.");
  // Safety catch: this build is meant for test mode. A live key must be switched on deliberately.
  if (!key.startsWith("sk_test_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("STRIPE_SECRET_KEY is not a test key. Set STRIPE_ALLOW_LIVE=true to take real payments.");
  }
  if (!client) client = new Stripe(key);
  return client;
}
