import Link from "next/link";
import { integrationStatus } from "@/lib/config";
import { emailConfigured } from "@/lib/ops/email";
import { loadDashboard } from "@/lib/ops/dashboard";
import { tiers } from "@/lib/site";
import { LEVEL_STYLE, STATUS_LABEL, money, when } from "./format";

export const dynamic = "force-dynamic";

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-navy-900 tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export default async function AdminPage() {
  const status = integrationStatus();
  if (!status.supabase) {
    return <p className="text-slate-600">Supabase isn&apos;t connected yet, so there are no orders to show.</p>;
  }
  const { rows, attention, summary, usdToCad } = await loadDashboard();
  const avgCost = summary.orders30 ? summary.cost30 / summary.orders30 : 0;
  const tierName = (id: string) => tiers.find((t) => t.id === id)?.name.replace(" Review", "").replace(" Reviewed", "") ?? id;
  const missing = [
    !status.stripeWebhook && "Stripe webhook",
    !status.trigger && "Trigger.dev",
    !emailConfigured() && "email (Resend)",
  ].filter(Boolean);

  return (
    <div className="space-y-10">
      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Not set up yet: {missing.join(", ")}.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Needs you" value={summary.needsAttention} />
        <Stat label="Expert reviews" value={summary.inReview} />
        <Stat label="Waiting on buyer" value={summary.waitingOnBuyer} />
        <Stat label="Revenue, 30 days" value={money(summary.revenue30)} note={`${summary.orders30} orders`} />
        <Stat
          label="Avg cost per order"
          value={money(avgCost)}
          note={summary.revenue30 ? `${Math.round((1 - summary.cost30 / summary.revenue30) * 100)}% margin` : undefined}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-navy-900">Needs your attention</h2>
        {attention.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing right now.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {attention.map(({ order: o, attention: a }) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{o.property_address}</p>
                    <p className="text-sm text-slate-500">
                      {tierName(o.tier)}
                      {o.rush ? " + Rush" : ""} · {o.buyer_name} · {STATUS_LABEL[o.status] ?? o.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {a.map((x, i) => (
                      <span key={i} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${LEVEL_STYLE[x.level]}`}>
                        {x.reason.length > 70 ? `${x.reason.slice(0, 70)}…` : x.reason}
                      </span>
                    ))}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-navy-900">All orders</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cost includes Claude, processing compute and the Stripe fee. US dollar costs are converted at {usdToCad} CAD.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Ordered</th>
                <th className="px-4 py-2 font-medium">Property</th>
                <th className="px-4 py-2 font-medium">Review</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">Cost</th>
                <th className="px-4 py-2 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.order.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{when(r.order.created_at)}</td>
                  <td className="max-w-[260px] truncate px-4 py-2">
                    <Link href={`/admin/orders/${r.order.id}`} className="font-medium text-brand-600 hover:underline">
                      {r.order.property_address}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {tierName(r.order.tier)}
                    {r.order.rush ? " + Rush" : ""}
                  </td>
                  <td className="px-4 py-2">{STATUS_LABEL[r.order.status] ?? r.order.status}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.revenueCents)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {money(r.costCents)}
                    {!r.hasFee && r.revenueCents > 0 && <span className="text-slate-400" title="Stripe fee not recorded yet">*</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(r.revenueCents - r.costCents)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
