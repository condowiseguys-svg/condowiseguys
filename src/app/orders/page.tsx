import Link from "next/link";
import { PaymentBadge, StatusBadge, buttonPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/config";
import { shortId, type Order } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "My orders · Condo Wise Guys" };

export default async function OrdersPage() {
  const user = await requireUser("/orders");
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as Order[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My orders</h1>
        <Link href="/order/quick-scan" className={buttonPrimary}>
          New Quick Scan
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-slate-600">You have no orders yet.</p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/orders/${o.id}`}
                className="bg-white rounded-xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3 hover:border-brand"
              >
                <div>
                  <div className="font-medium">{o.property}</div>
                  <div className="text-xs text-slate-500">
                    Order {shortId(o.id)} · {formatDate(o.created_at)} · {formatMoney(o.amount_cents, o.currency)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <PaymentBadge status={o.payment_status} />
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
