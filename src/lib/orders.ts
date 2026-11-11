import "server-only";
import type Stripe from "stripe";
import { recordCost } from "@/lib/ops/costs";
import { emailHtml, escapeHtml, sendEmailOnce } from "@/lib/ops/email";
import { logEvent, raiseIssue, resolveIssues } from "@/lib/ops/events";
import { payLink } from "@/lib/ops/urls";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type OrderRow = {
  id: string;
  status:
    | "pending_payment"
    | "payment_failed"
    | "paid"
    | "processing"
    | "awaiting_documents"
    | "in_review"
    | "approved"
    | "delivered"
    | "cancelled"
    | "refunded";
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
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString(), stripe_payment_intent: paymentIntent })
    .eq("id", orderId)
    .eq("stripe_session_id", session.id)
    .in("status", ["pending_payment", "payment_failed"])
    .select("id");
  if (error) throw error;
  if (data?.length) {
    await logEvent(orderId, "stripe", "paid", { session: session.id, amount: session.amount_total });
    await resolveIssues({ orderId }, "stripe", "Payment succeeded");
    if (paymentIntent) await recordStripeFee(orderId, paymentIntent);
  }
  return true;
}

/** Stores Stripe's processing fee as a cost of the order. Best effort; keyed so it counts once. */
export async function recordStripeFee(orderId: string, paymentIntentId: string) {
  try {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    if (!bt) return;
    await recordCost({
      orderId,
      category: "payment_fee",
      description: "Stripe processing fee",
      costCents: bt.fee,
      currency: bt.currency === "usd" ? "usd" : "cad",
      key: `stripe-fee:${paymentIntentId}`,
    });
  } catch (err) {
    console.error("Could not record Stripe fee", err);
  }
}

/** A delayed payment method (e.g. bank debit) failed after checkout. */
export async function markPaymentFailed(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return;
  const db = supabaseAdmin();
  const { data } = await db
    .from("orders")
    .update({ status: "payment_failed", payment_failed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("stripe_session_id", session.id)
    .eq("status", "pending_payment")
    .select("id, upload_token, buyer_name, buyer_email, property_address");
  const order = data?.[0];
  if (!order) return;
  await logEvent(orderId, "stripe", "payment_failed", { session: session.id });
  await raiseIssue({
    orderId,
    kind: "payment_failed",
    message: "The payment did not go through. The buyer was emailed a link to try again.",
    dedupeKey: `payment-failed:${session.id}`,
  });
  const link = payLink(order.id, order.upload_token);
  await sendEmailOnce({
    key: `payment-failed:${session.id}`,
    orderId,
    kind: "payment_failed",
    to: order.buyer_email,
    subject: "Your payment didn't go through",
    html: emailHtml(
      [
        `Hi ${escapeHtml(order.buyer_name.split(" ")[0])},`,
        `Your payment for the review of <strong>${escapeHtml(order.property_address)}</strong> didn't go through, so we haven't started.`,
        "You can try again with the same or a different payment method. Your order details are saved.",
      ],
      { href: link, label: "Try payment again" },
    ),
    text: `Your payment for ${order.property_address} didn't go through. Try again: ${link}\n`,
  });
}

/** Checkout expired without payment: the buyer walked away. No email, just a record. */
export async function markCheckoutExpired(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) return;
  const { data } = await supabaseAdmin()
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("stripe_session_id", session.id)
    .eq("status", "pending_payment")
    .select("id");
  if (data?.length) await logEvent(orderId, "stripe", "checkout_expired", { session: session.id });
}

async function orderIdForPaymentIntent(paymentIntent: string | null | undefined) {
  if (!paymentIntent) return null;
  const { data } = await supabaseAdmin()
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent", paymentIntent)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Refund issued (from the Stripe dashboard). Fully refunded orders stop. */
export async function markRefunded(charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  const orderId = await orderIdForPaymentIntent(pi);
  if (!orderId) return;
  const full = charge.amount_refunded >= charge.amount;
  if (full) {
    await supabaseAdmin()
      .from("orders")
      .update({ status: "refunded", refunded_at: new Date().toISOString() })
      .eq("id", orderId)
      .neq("status", "refunded");
  }
  await logEvent(orderId, "stripe", full ? "refunded" : "partially_refunded", { amount_refunded: charge.amount_refunded });
}

export async function markDisputed(dispute: Stripe.Dispute) {
  const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
  const orderId = await orderIdForPaymentIntent(pi);
  if (!orderId) return;
  await raiseIssue({
    orderId,
    kind: "dispute",
    message: `The buyer disputed the charge (${dispute.reason}). Respond in Stripe before the deadline.`,
    dedupeKey: `dispute:${dispute.id}`,
  });
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
