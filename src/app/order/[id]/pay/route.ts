import { NextResponse } from "next/server";
import { startCheckout } from "@/lib/checkout";
import { logEvent } from "@/lib/ops/events";
import { getOrderWithToken } from "@/lib/orders";

/** Link from the "payment didn't go through" email: opens a fresh Stripe Checkout for the same order. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const order = await getOrderWithToken(id, token);
  if (!order) return new NextResponse("Not found", { status: 404 });
  const uploadPage = new URL(`/order/${order.id}/upload?token=${token}`, req.url);
  if (!["pending_payment", "payment_failed", "cancelled"].includes(order.status)) {
    return NextResponse.redirect(uploadPage, 303);
  }
  await logEvent(order.id, "buyer", "payment_retry", { from: order.status });
  return NextResponse.redirect(await startCheckout(order), 303);
}
