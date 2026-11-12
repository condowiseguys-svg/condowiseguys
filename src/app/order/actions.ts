"use server";

import { redirect } from "next/navigation";
import { startCheckout } from "@/lib/checkout";
import { orderingEnabled } from "@/lib/config";
import { logEvent } from "@/lib/ops/events";
import { isStripeTestMode } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { orderPriceCents, tiers } from "@/lib/site";

export type OrderFormState = { error?: string };

function text(form: FormData, name: string, max = 300) {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function createOrder(_prev: OrderFormState, form: FormData): Promise<OrderFormState> {
  if (!orderingEnabled()) return { error: "Online ordering is not switched on yet." };

  const tierId = text(form, "tier");
  const tier = tiers.find((t) => t.id === tierId);
  const rush = form.get("rush") === "on";
  const buyerName = text(form, "buyer_name", 120);
  const buyerEmail = text(form, "buyer_email", 200);
  const propertyAddress = text(form, "property_address", 300);
  const subjectDate = text(form, "subject_removal_date", 10);

  if (!tier) return { error: "Please choose a review type." };
  if (!buyerName || !buyerEmail || !propertyAddress)
    return { error: "Please fill in your name, email and the property address." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) return { error: "Please enter a valid email." };
  if (subjectDate && !/^\d{4}-\d{2}-\d{2}$/.test(subjectDate)) return { error: "Please check the date." };
  if (form.get("agree") !== "on")
    return { error: "Please confirm you understand the report is a document review, not legal advice." };

  const amount = orderPriceCents(tier.id, rush, isStripeTestMode());
  if (amount === null) return { error: "Prices are not set yet. Please email us to order." };

  const db = supabaseAdmin();
  const { data: order, error } = await db
    .from("orders")
    .insert({
      tier: tier.id,
      rush,
      amount_cents: amount,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      buyer_phone: text(form, "buyer_phone", 40) || null,
      property_address: propertyAddress,
      unit_number: text(form, "unit_number", 40) || null,
      strata_plan: text(form, "strata_plan", 40) || null,
      subject_removal_date: subjectDate || null,
      notes: text(form, "notes", 2000) || null,
    })
    .select("id, upload_token")
    .single();
  if (error || !order) {
    console.error("order insert failed", error);
    return { error: "Something went wrong saving your order. Please try again." };
  }

  await logEvent(order.id, "buyer", "order_created", { tier: tier.id, rush, amount_cents: amount });
  let paymentUrl: string;
  try {
    paymentUrl = await startCheckout({ ...order, tier: tier.id, rush, amount_cents: amount, buyer_email: buyerEmail, property_address: propertyAddress });
  } catch (e) {
    console.error("stripe checkout failed", e);
    // In test mode, show Stripe's reason so setup problems are easy to spot.
    const detail = isStripeTestMode() && e instanceof Error ? ` (${e.message})` : "";
    return { error: `We saved your order but could not open the payment page${detail}. Please try again or email us.` };
  }
  redirect(paymentUrl);
}
