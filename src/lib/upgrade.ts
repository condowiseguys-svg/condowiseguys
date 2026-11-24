import "server-only";
import type Stripe from "stripe";
import { emailHtml, escapeHtml, sendEmailOnce } from "@/lib/ops/email";
import { logEvent } from "@/lib/ops/events";
import { startProcessing } from "@/lib/ops/jobs";
import { notifyAdmin } from "@/lib/ops/notify";
import { siteUrl, upgradeLink } from "@/lib/ops/urls";
import { recordStripeFee, type OrderRow } from "@/lib/orders";
import { stripe } from "@/lib/stripe";
import { founder, tiers, upgradeOffer, upgradePriceCents } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Standard to Expert upgrades. The buyer pays the difference as a second Stripe payment on the
 * same order. Once paid, the order becomes Expert Reviewed, keeps its documents, and goes to
 * Brian's review queue: straight away if the report hasn't been sent yet, or through a fresh
 * draft if the Standard report was already delivered.
 */

export const UPGRADE_PURPOSE = "upgrade";

/** The order columns added by "Step 7 - upgrades.sql". Missing until that step is run. */
export type UpgradeColumns = {
  upgrade_session_id?: string | null;
  upgrade_payment_intent?: string | null;
  upgrade_amount_cents?: number | null;
  upgraded_at?: string | null;
  upgraded_from_status?: string | null;
  delivered_at?: string | null;
  documents_purged_at?: string | null;
  submission_count?: number;
};

export type UpgradeOrder = OrderRow & UpgradeColumns;

/** Statuses where a paid upgrade only switches the tier: the report hasn't gone out yet. */
const BEFORE_REPORT = ["paid", "processing", "awaiting_documents", "in_review"];
/** Statuses where the Standard report is out (or going out): the upgrade starts a new draft. */
const AFTER_REPORT = ["approved", "delivered"];

const DAY = 24 * 60 * 60 * 1000;

export type UpgradeCheck =
  | { ok: true; priceCents: number; creditCents: number; expertCents: number }
  | { ok: false; reason: "already_expert" | "upgraded" | "not_paid" | "refunded" | "sending" | "expired" | "no_price" };

export function isUpgraded(order: UpgradeOrder) {
  return Boolean(order.upgraded_at);
}

/** Whether this order can be upgraded right now, and what it costs. */
export function checkUpgrade(order: UpgradeOrder, testMode: boolean): UpgradeCheck {
  if (order.upgraded_at) return { ok: false, reason: "upgraded" };
  if (order.tier !== "standard") return { ok: false, reason: "already_expert" };
  if (order.status === "refunded") return { ok: false, reason: "refunded" };
  if (order.status === "approved") return { ok: false, reason: "sending" };
  if (![...BEFORE_REPORT, "delivered"].includes(order.status)) return { ok: false, reason: "not_paid" };
  if (order.status === "delivered") {
    const delivered = order.delivered_at ? new Date(order.delivered_at).getTime() : 0;
    if (order.documents_purged_at || (delivered && Date.now() - delivered > upgradeOffer.daysAfterDelivery * DAY)) {
      return { ok: false, reason: "expired" };
    }
  }
  const price = upgradePriceCents(order, testMode);
  if (price === null || price <= 0) return { ok: false, reason: "no_price" };
  return { ok: true, priceCents: price, creditCents: order.amount_cents, expertCents: price + order.amount_cents };
}

/** Opens a Stripe Checkout for the difference and returns its URL. */
export async function startUpgradeCheckout(order: UpgradeOrder, testMode: boolean): Promise<string> {
  const check = checkUpgrade(order, testMode);
  if (!check.ok) throw new Error(`Order can't be upgraded (${check.reason})`);
  const expert = tiers.find((t) => t.id === "expert");
  const base = siteUrl();
  const back = `${base}/order/${order.id}/upgrade?token=${order.upload_token}`;
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: order.buyer_email,
    client_reference_id: order.id,
    metadata: { order_id: order.id, purpose: UPGRADE_PURPOSE },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: check.priceCents,
          product_data: {
            name: `Upgrade to ${expert?.name ?? "Expert Reviewed"}`,
            description: `${order.property_address}. Your Standard payment of $${(check.creditCents / 100).toFixed(2)} is credited.`,
          },
        },
      },
    ],
    success_url: `${back}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}&cancelled=1`,
  });
  const { error } = await supabaseAdmin()
    .from("orders")
    .update({ upgrade_session_id: session.id })
    .eq("id", order.id)
    .eq("tier", "standard")
    .is("upgraded_at", null);
  if (error) {
    // Most likely "Step 7 - upgrades.sql" hasn't been run yet.
    console.error("could not save upgrade session", error);
    throw new Error("Upgrades are not switched on yet.");
  }
  await logEvent(order.id, "buyer", "upgrade_checkout_started", { session: session.id, amount: check.priceCents });
  return session.url!;
}

async function loadForUpgrade(orderId: string) {
  const { data } = await supabaseAdmin().from("orders").select("*").eq("id", orderId).maybeSingle();
  return (data as UpgradeOrder | null) ?? null;
}

/**
 * The upgrade payment went through: make the order Expert Reviewed and send it to Brian.
 * Safe to call more than once (webhook retries, and the buyer's return page).
 */
export async function markUpgradePaid(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId || session.metadata?.purpose !== UPGRADE_PURPOSE || session.payment_status !== "paid") return false;
  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const db = supabaseAdmin();

  // Brian or the report pipeline may move the order at the same moment; retry on a lost race.
  for (let attempt = 0; attempt < 3; attempt++) {
    const order = await loadForUpgrade(orderId);
    if (!order || order.upgraded_at || order.upgrade_session_id !== session.id) return true;
    const restart = AFTER_REPORT.includes(order.status);
    if (!restart && !BEFORE_REPORT.includes(order.status)) {
      // Refunded or otherwise closed while the buyer was paying: Brian sorts it out.
      await notifyAdmin({
        key: `upgrade-stuck:${session.id}`,
        orderId,
        subject: "Upgrade paid on a closed order",
        lines: [`The buyer paid to upgrade to Expert Reviewed, but the order is "${escapeHtml(order.status)}". Please check it and refund the upgrade in Stripe if needed.`],
      });
      return true;
    }
    const { data: moved, error } = await db
      .from("orders")
      .update({
        tier: "expert",
        upgraded_at: new Date().toISOString(),
        upgrade_payment_intent: paymentIntent ?? null,
        upgrade_amount_cents: session.amount_total ?? null,
        upgraded_from_status: order.status,
        ...(restart ? { status: "processing", processing_run_id: null, processing_started_at: null } : {}),
      })
      .eq("id", orderId)
      .eq("status", order.status)
      .eq("upgrade_session_id", session.id)
      .is("upgraded_at", null)
      .select("id");
    if (error) throw error;
    if (!moved?.length) continue;

    await logEvent(orderId, "stripe", "upgraded_to_expert", {
      session: session.id,
      amount: session.amount_total,
      from_status: order.status,
    });
    if (paymentIntent) await recordStripeFee(orderId, paymentIntent);
    const paid = `$${((session.amount_total ?? 0) / 100).toFixed(2)}`;
    await notifyAdmin({
      key: `upgraded:${session.id}`,
      orderId,
      subject: "Upgraded to Expert Reviewed",
      lines: [
        `The buyer paid ${paid} to upgrade this Standard order to Expert Reviewed. They expect your check and a call to go through the findings.`,
        restart
          ? "The Standard report had already been sent, so a fresh draft is being written. It will come to you for review like any Expert order. If no draft appears, press “Re-run processing” on the order or upload your edited PDF."
          : "The report hadn't been sent yet, so it will now wait for your check instead of going out automatically.",
      ],
    });
    await sendUpgradeConfirmation(order, session, restart);
    if (restart) {
      try {
        await startProcessing(orderId, order.submission_count ?? 1, `:upgrade-${session.id.slice(-8)}`);
      } catch (err) {
        console.error("could not start processing after upgrade", orderId, err);
      }
    }
    return true;
  }
  throw new Error("Order kept changing while applying the upgrade");
}

async function sendUpgradeConfirmation(order: UpgradeOrder, session: Stripe.Checkout.Session, restart: boolean) {
  try {
    const first = order.buyer_name.split(" ")[0];
    const paid = `$${((session.amount_total ?? 0) / 100).toFixed(2)} CAD`;
    const credit = `$${(order.amount_cents / 100).toFixed(2)}`;
    const when = tiers.find((t) => t.id === "expert")?.turnaround.toLowerCase() ?? "1 to 2 business days";
    const next = restart
      ? `${founder.name.split(" ")[0]} will now check your report personally and send you the Expert Reviewed version, usually within ${when}.`
      : `Your report will now be checked personally by ${founder.name.split(" ")[0]} before it is sent, usually within ${when}.`;
    await sendEmailOnce({
      key: `upgrade-confirmed:${session.id}`,
      orderId: order.id,
      kind: "upgrade_confirmed",
      to: order.buyer_email,
      subject: `Upgraded to Expert Reviewed: ${order.property_address}`,
      html: emailHtml(
        [
          `Hi ${escapeHtml(first)},`,
          `Thanks for upgrading your review of <strong>${escapeHtml(order.property_address)}</strong> to Expert Reviewed. We received <strong>${escapeHtml(paid)}</strong>, with the ${escapeHtml(credit)} you paid for Standard credited in full.`,
          escapeHtml(next),
          "Once you have the report, reply to that email to set up a call with Brian to talk through the findings.",
        ],
        { href: upgradeLink(order.id, order.upload_token), label: "View your order" },
      ),
      text: `Hi ${first},\n\nThanks for upgrading your review of ${order.property_address} to Expert Reviewed. We received ${paid}, with the ${credit} you paid for Standard credited in full.\n\n${next}\n\nOnce you have the report, reply to that email to set up a call with Brian to talk through the findings.\n`,
    });
  } catch (err) {
    console.error("upgrade confirmation email failed", order.id, err);
  }
}

/** The buyer can return from Stripe before the webhook arrives; confirm with Stripe directly. */
export async function ensureUpgradePaid(order: UpgradeOrder, sessionId?: string): Promise<UpgradeOrder> {
  if (order.upgraded_at || !order.upgrade_session_id) return order;
  if (sessionId && sessionId !== order.upgrade_session_id) return order;
  const session = await stripe().checkout.sessions.retrieve(order.upgrade_session_id);
  if (session.metadata?.order_id !== order.id || session.payment_status !== "paid") return order;
  await markUpgradePaid(session);
  return (await loadForUpgrade(order.id)) ?? order;
}
