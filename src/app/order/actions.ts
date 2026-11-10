"use server";

import { redirect } from "next/navigation";
import { siteUrl, orderingEnabled } from "@/lib/config";
import { isStripeTestMode, stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { orderPriceCents, rushAddOn, tiers } from "@/lib/site";

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

  const base = siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: buyerEmail,
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: amount,
          product_data: {
            name: `${tier.name}${rush ? ` + ${rushAddOn.name}` : ""}`,
            description: propertyAddress,
          },
        },
      },
    ],
    success_url: `${base}/order/${order.id}/upload?token=${order.upload_token}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/order?tier=${tier.id}&cancelled=1`,
  });

  await db.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
  redirect(session.url!);
}
