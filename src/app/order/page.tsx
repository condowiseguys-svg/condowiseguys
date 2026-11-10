import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Order a review",
  description: "Order a BC strata document review from Condo Wise Guys.",
};

// Online ordering (Stripe payment and secure upload) is the next build step.
// Until then this page collects interest by email.
export default function Order() {
  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Order a review</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900">
          Online ordering opens soon
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          We are finishing secure payment and document upload. In the meantime, email us
          your property address and your subject-removal date and we will reply with next
          steps.
        </p>
        <a
          href={`mailto:${site.email}?subject=Strata%20document%20review%20request`}
          className="mt-8 inline-block rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500"
        >
          Email {site.email}
        </a>
        <p className="mt-8 text-sm text-slate-500">
          Want to see what you get first? <Link href="/sample-report" className="font-semibold text-brand-600 hover:underline">Read the sample report</Link>.
        </p>
      </div>
    </div>
  );
}
