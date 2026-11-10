import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markPaidFromSession } from "@/lib/orders";
import { stripe } from "@/lib/stripe";

// Stripe sends payment confirmations here. Configure in Stripe:
// Developers > Webhooks > Add endpoint: https://<site>/api/stripe/webhook
// Event: checkout.session.completed. Put the signing secret in STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    console.error("Stripe signature check failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    await markPaidFromSession(event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ received: true });
}
