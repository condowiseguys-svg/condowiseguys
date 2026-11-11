import "server-only";
import { siteUrl } from "@/lib/config";
import { stripe } from "@/lib/stripe";
import { rushAddOn, tiers } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Creates a Stripe Checkout session for an order and saves its id. Returns the payment URL. */
export async function startCheckout(order: {
  id: string;
  upload_token: string;
  tier: string;
  rush: boolean;
  amount_cents: number;
  buyer_email: string;
  property_address: string;
}) {
  const tier = tiers.find((t) => t.id === order.tier);
  const base = siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: order.buyer_email,
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: order.amount_cents,
          product_data: {
            name: `${tier?.name ?? "Strata document review"}${order.rush ? ` + ${rushAddOn.name}` : ""}`,
            description: order.property_address,
          },
        },
      },
    ],
    success_url: `${base}/order/${order.id}/upload?token=${order.upload_token}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/order/${order.id}/upload?token=${order.upload_token}&cancelled=1`,
  });
  await supabaseAdmin()
    .from("orders")
    .update({ stripe_session_id: session.id, status: "pending_payment" })
    .eq("id", order.id)
    .in("status", ["pending_payment", "payment_failed", "cancelled"]);
  return session.url!;
}
