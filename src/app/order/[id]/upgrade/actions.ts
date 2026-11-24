"use server";

import { redirect } from "next/navigation";
import { getOrderWithToken } from "@/lib/orders";
import { isStripeTestMode } from "@/lib/stripe";
import { startUpgradeCheckout, type UpgradeOrder } from "@/lib/upgrade";

/** The buyer pressed "Pay the difference": open Stripe Checkout for the upgrade. */
export async function startUpgrade(orderId: string, token: string) {
  const order = (await getOrderWithToken(orderId, token)) as UpgradeOrder | null;
  if (!order) redirect("/");
  let url: string;
  try {
    url = await startUpgradeCheckout(order, isStripeTestMode());
  } catch (err) {
    console.error("upgrade checkout failed", orderId, err);
    redirect(`/order/${orderId}/upgrade?token=${token}&error=1`);
  }
  redirect(url);
}
