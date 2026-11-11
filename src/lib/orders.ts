import "server-only";
import type Stripe from "stripe";
import { adminEmails, siteUrl } from "./config";
import { sendEmail } from "./email";
import { getStripe } from "./stripe";
import { createAdminClient } from "./supabase/server";

export type OrderStatus =
  | "awaiting_payment"
  | "awaiting_documents"
  | "in_review"
  | "delivered"
  | "cancelled";

export type PaymentStatus = "unpaid" | "paid" | "refunded";

export type FileKind = "package" | "report";

export interface OrderFile {
  id: string;
  order_id: string;
  kind: FileKind;
  bucket: "packages" | "reports";
  storage_path: string;
  filename: string;
  size_bytes: number;
  content_type: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  email: string;
  customer_name: string;
  property: string;
  notes: string | null;
  service: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_livemode: boolean;
  paid_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  order_files?: OrderFile[];
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_files(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const order = data as Order | null;
  order?.order_files?.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return order;
}

/** Marks an order paid from a completed Checkout Session. Safe to call more than once. */
export async function markOrderPaid(session: Stripe.Checkout.Session): Promise<void> {
  const orderId = session.client_reference_id ?? session.metadata?.order_id;
  if (!orderId || session.payment_status !== "paid") return;
  const admin = createAdminClient();
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const { data, error } = await admin
    .from("orders")
    .update({
      payment_status: "paid",
      status: "awaiting_documents",
      paid_at: new Date().toISOString(),
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntent,
      stripe_livemode: session.livemode,
      amount_cents: session.amount_total ?? undefined,
      currency: session.currency ?? undefined,
    })
    .eq("id", orderId)
    .eq("payment_status", "unpaid")
    .select("id, email, customer_name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return; // already recorded

  await sendEmail(
    adminEmails(),
    `New paid Quick Scan order ${shortId(orderId)}`,
    `${data.customer_name} <${data.email}> has paid for a Quick Scan.\n\n${siteUrl()}/admin/orders/${orderId}`,
  );
}

/**
 * If the customer comes back from Stripe before the webhook lands, ask Stripe
 * directly so the order page is never stuck on "awaiting payment".
 */
export async function reconcilePayment(order: Order): Promise<boolean> {
  if (order.payment_status !== "unpaid" || !order.stripe_checkout_session_id) return false;
  try {
    const session = await getStripe().checkout.sessions.retrieve(order.stripe_checkout_session_id);
    if (session.payment_status === "paid" && session.client_reference_id === order.id) {
      await markOrderPaid(session);
      return true;
    }
  } catch (err) {
    console.error("Could not confirm payment with Stripe", err);
  }
  return false;
}
