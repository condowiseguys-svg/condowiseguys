import type { Metadata } from "next";
import Link from "next/link";
import { orderingEnabled } from "@/lib/config";
import { isStripeTestMode } from "@/lib/stripe";
import { formatPrice, orderPriceCents, rushAddOn, site, tiers } from "@/lib/site";
import { OrderForm } from "./OrderForm";

export const metadata: Metadata = {
  title: "Order a review",
  description: "Order a BC strata document review from Condo Wise Guys.",
};

export const dynamic = "force-dynamic";

function displayPrice(cents: number | null) {
  return cents === null ? formatPrice(null) : formatPrice(cents / 100);
}

export default async function Order({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; cancelled?: string }>;
}) {
  const params = await searchParams;
  const testMode = isStripeTestMode();
  const enabled = orderingEnabled() && orderPriceCents("standard", false, testMode) !== null;
  const initialTier = tiers.some((t) => t.id === params.tier) ? params.tier! : "expert";

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Order a review</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">
          {enabled ? "Order your strata document review" : "Online ordering opens soon"}
        </h1>

        {params.cancelled && (
          <p className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            Payment was cancelled and you have not been charged. You can try again below.
          </p>
        )}

        {enabled ? (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
            <OrderForm
              tiers={tiers.map((t) => ({
                id: t.id,
                name: t.name,
                turnaround: t.turnaround,
                price: displayPrice(orderPriceCents(t.id, false, testMode)),
              }))}
              rushPrice={displayPrice(
                (() => {
                  const withRush = orderPriceCents("standard", true, testMode);
                  const without = orderPriceCents("standard", false, testMode);
                  return withRush !== null && without !== null ? withRush - without : null;
                })(),
              )}
              initialTier={initialTier}
              testMode={testMode}
            />
          </div>
        ) : (
          <>
            <p className="mt-4 leading-7 text-slate-600">
              We are finishing secure payment and document upload. In the meantime, email us your
              property address and your subject-removal date and we will reply with next steps.
            </p>
            <a
              href={`mailto:${site.email}?subject=Strata%20document%20review%20request`}
              className="mt-8 inline-block rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500"
            >
              Email {site.email}
            </a>
          </>
        )}

        <p className="mt-8 text-sm text-slate-500">
          Want to see what you get first?{" "}
          <Link href="/sample-report" className="font-semibold text-brand-600 hover:underline">
            Read the sample report
          </Link>
          . {rushAddOn.name} orders are prioritized for tight deadlines.
        </p>
      </div>
    </div>
  );
}
