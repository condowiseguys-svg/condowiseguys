import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderWithToken } from "@/lib/orders";
import { isStripeTestMode } from "@/lib/stripe";
import { formatPrice, founder, tiers, upgradeOffer } from "@/lib/site";
import { checkUpgrade, ensureUpgradePaid, type UpgradeOrder } from "@/lib/upgrade";
import { startUpgrade } from "./actions";

export const metadata: Metadata = { title: "Upgrade to Expert Reviewed", robots: { index: false } };
export const dynamic = "force-dynamic";
// Returning from Stripe can start processing on this server when Trigger.dev isn't set up.
export const maxDuration = 300;

const box = "mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8";

function cad(cents: number) {
  return formatPrice(cents / 100).replace(" CAD", "");
}

export default async function UpgradePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; session_id?: string; cancelled?: string; error?: string }>;
}) {
  const { id } = await params;
  const { token = "", session_id, cancelled, error } = await searchParams;
  let order = (await getOrderWithToken(id, token)) as UpgradeOrder | null;
  if (!order) notFound();
  if (session_id) {
    try {
      order = await ensureUpgradePaid(order, session_id);
    } catch (err) {
      console.error("could not confirm upgrade payment", id, err);
    }
  }

  const testMode = isStripeTestMode();
  const expert = tiers.find((t) => t.id === "expert")!;
  const check = checkUpgrade(order, testMode);
  const brian = founder.name.split(" ")[0];

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Order {order.id.slice(0, 8)}</p>

        {order.upgraded_at ? (
          <>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">You&apos;re upgraded to {expert.name}</h1>
            <p className="mt-4 leading-7 text-slate-600">
              Thanks, {order.buyer_name.split(" ")[0]}. {brian} will check your report for{" "}
              <strong>{order.property_address}</strong> personally and email you the {expert.name} version
              ({expert.turnaround.toLowerCase()}). When it arrives, reply to that email to set up a call with{" "}
              {brian} to talk through the findings.
            </p>
            <p className="mt-4 text-sm text-slate-500">A receipt and confirmation are on their way to {order.buyer_email}.</p>
          </>
        ) : session_id && !cancelled ? (
          <>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Confirming your payment</h1>
            <p className="mt-4 leading-7 text-slate-600">
              We haven&apos;t had confirmation from Stripe yet. Refresh this page in a minute.
            </p>
          </>
        ) : check.ok ? (
          <>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">Upgrade to {expert.name}</h1>
            <p className="mt-4 leading-7 text-slate-600">
              For <strong>{order.property_address}</strong>. {upgradeOffer.long}
            </p>
            {cancelled && (
              <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                Payment was cancelled and you have not been charged.
              </p>
            )}
            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-risk-red ring-1 ring-red-200">
                We couldn&apos;t open the payment page. Please try again, or{" "}
                <Link href="/contact" className="underline">contact us</Link>.
              </p>
            )}
            <div className={box}>
              <h2 className="font-semibold text-navy-900">What you get</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {expert.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-brand-600">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <dl className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-600">{expert.name}{order.rush ? " + Rush" : ""}</dt>
                  <dd className="tabular-nums">{cad(check.expertCents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Credit for what you paid</dt>
                  <dd className="tabular-nums text-risk-green">−{cad(check.creditCents)}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-navy-900">
                  <dt>You pay</dt>
                  <dd className="tabular-nums">{formatPrice(check.priceCents / 100)}</dd>
                </div>
              </dl>
              {testMode && (
                <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-risk-amber ring-1 ring-amber-200">
                  Test mode: no real charge. Use card 4242 4242 4242 4242, any future date and any CVC.
                </p>
              )}
              <form action={startUpgrade.bind(null, order.id, token)} className="mt-6">
                <button className="w-full rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500">
                  Pay the difference and upgrade
                </button>
              </form>
              <p className="mt-3 text-xs text-slate-500">
                Nothing to upload again: we use the documents you already sent.
                {order.status === "delivered"
                  ? ` Open for ${upgradeOffer.daysAfterDelivery} days after your report was delivered.`
                  : " Your report will wait for Brian's check instead of being sent automatically."}
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">
              {check.reason === "already_expert" ? `This order is already ${expert.name}` : "Upgrade isn't available for this order"}
            </h1>
            <p className="mt-4 leading-7 text-slate-600">
              {check.reason === "already_expert"
                ? `${brian} checks your report personally before it is sent. When you receive it, reply to that email to set up a call to talk through the findings.`
                : check.reason === "sending"
                  ? "Your Standard report is being sent right now. Please come back to this page in a few minutes to upgrade."
                  : check.reason === "expired"
                    ? `Upgrades are open for ${upgradeOffer.daysAfterDelivery} days after delivery, while we still hold your documents. Please contact us and we'll see what we can do.`
                    : check.reason === "not_paid"
                      ? "This order hasn't been paid yet."
                      : "Please contact us and we'll help."}
            </p>
            {check.reason !== "already_expert" && check.reason !== "sending" && (
              <Link href="/contact" className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500">
                Contact us
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
