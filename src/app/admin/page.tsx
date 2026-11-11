import Link from "next/link";
import { PaymentBadge, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/config";
import { shortId, type Order } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard · Condo Wise Guys" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const { data, error } = await createAdminClient()
    .from("orders")
    .select("*, order_files(id, kind)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const orders = (data ?? []) as Order[];

  const needsAction = orders.filter((o) => o.status === "in_review").length;
  const paidTotal = orders
    .filter((o) => o.payment_status === "paid")
    .reduce((sum, o) => sum + o.amount_cents, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        {[
          ["Orders", String(orders.length)],
          ["Waiting on you", String(needsAction)],
          ["Paid", formatMoney(paidTotal, orders[0]?.currency ?? "cad")],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Files</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No orders yet.
                </td>
              </tr>
            )}
            {orders.map((o) => {
              const packages = o.order_files?.filter((f) => f.kind === "package").length ?? 0;
              const reports = o.order_files?.filter((f) => f.kind === "report").length ?? 0;
              return (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-medium text-brand hover:underline">
                      {shortId(o.id)}
                    </Link>
                    <div className="text-xs text-slate-500">{formatDate(o.created_at)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {o.customer_name}
                    <div className="text-xs text-slate-500">{o.email}</div>
                  </td>
                  <td className="px-4 py-3 max-w-56 truncate">{o.property}</td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={o.payment_status} />
                    <div className="text-xs text-slate-500 mt-0.5">{formatMoney(o.amount_cents, o.currency)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600 whitespace-nowrap">
                    {packages} uploaded · {reports} report
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
