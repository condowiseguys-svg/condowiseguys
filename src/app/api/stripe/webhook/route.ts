import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markCheckoutExpired, markDisputed, markPaidFromSession, markPaymentFailed, markRefunded } from "@/lib/orders";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Stripe sends payment events here. In Stripe: Developers > Webhooks > Add endpoint
// https://<site>/api/stripe/webhook with the events listed in HANDLED below.
// Put the endpoint's signing secret in STRIPE_WEBHOOK_SECRET.
const HANDLED = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
  "charge.dispute.created",
]);

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
  if (!HANDLED.has(event.type)) return NextResponse.json({ received: true });

  // Stripe can deliver the same event more than once. Skip ones already handled.
  const db = supabaseAdmin();
  await db.from("stripe_events").upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true });
  const { data: seen } = await db.from("stripe_events").select("processed_at").eq("id", event.id).single();
  if (seen?.processed_at) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await markPaidFromSession(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.async_payment_failed":
        await markPaymentFailed(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.expired":
        await markCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;
      case "charge.refunded":
        await markRefunded(event.data.object as Stripe.Charge);
        break;
      case "charge.dispute.created":
        await markDisputed(event.data.object as Stripe.Dispute);
        break;
    }
  } catch (err) {
    // Not marked processed, so Stripe's retry will run it again. Every handler is safe to repeat.
    console.error("Stripe webhook handler failed", event.type, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  await db.from("stripe_events").update({ processed_at: new Date().toISOString() }).eq("id", event.id);
  return NextResponse.json({ received: true });
}
