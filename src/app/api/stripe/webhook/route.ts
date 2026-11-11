import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { markOrderPaid } from "@/lib/orders";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe calls this when a payment succeeds or is refunded.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // The signature is checked against the exact bytes Stripe sent.
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await markOrderPaid(event.data.object);
        break;
      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntent =
          typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
        if (charge.refunded && paymentIntent) {
          const { error } = await createAdminClient()
            .from("orders")
            .update({ payment_status: "refunded" })
            .eq("stripe_payment_intent_id", paymentIntent);
          if (error) throw new Error(error.message);
        }
        break;
      }
    }
  } catch (err) {
    console.error("Stripe webhook handling failed", err);
    // A 500 makes Stripe retry later.
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
