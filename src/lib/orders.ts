import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type OrderRow = {
  id: string;
  status: "pending_payment" | "paid" | "processing" | "in_review" | "delivered" | "cancelled";
  tier: "standard" | "expert";
  rush: boolean;
  amount_cents: number;
  buyer_name: string;
  buyer_email: string;
  property_address: string;
  unit_number: string | null;
  subject_removal_date: string | null;
  upload_token: string;
  stripe_session_id: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads an order only if the secret upload token matches. */
export async function getOrderWithToken(id: string, token: string): Promise<OrderRow | null> {
  if (!UUID.test(id) || !UUID.test(token)) return null;
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("upload_token", token)
    .maybeSingle();
  return (data as OrderRow | null) ?? null;
}

/** Marks an order paid from a completed Checkout Session. Safe to call more than once. */
export async function markPaidFromSession(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId || session.payment_status !== "paid") return false;
  const { error } = await supabaseAdmin()
    .from("orders")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
    })
    .eq("id", orderId)
    .eq("stripe_session_id", session.id)
    .eq("status", "pending_payment");
  if (error) throw error;
  return true;
}

/**
 * The buyer can land on the upload page before Stripe's webhook arrives.
 * If so, confirm the payment directly with Stripe.
 */
export async function ensurePaid(order: OrderRow, sessionId?: string): Promise<OrderRow> {
  if (order.status !== "pending_payment") return order;
  const id = sessionId && sessionId === order.stripe_session_id ? sessionId : order.stripe_session_id;
  if (!id) return order;
  const session = await stripe().checkout.sessions.retrieve(id);
  if (session.metadata?.order_id !== order.id) return order;
  if (await markPaidFromSession(session)) return { ...order, status: "paid" };
  return order;
}
