import type { Metadata } from "next";
import Link from "next/link";
import { reviewScope, site, sisterCompany, sisterLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "For realtors: strata document reviews for your buyers",
  description:
    "BC realtors: order a plain-English strata document review for your buyer before subject removal, with red, amber and green ratings and page references. Appraisals available through DreamHomeGroup.ca.",
  alternates: { canonical: "/for-realtors" },
};

const reasons = [
  {
    title: "Fewer surprises after closing",
    text: "Special levies, underfunded reserves, leaks and disputes are flagged before your buyer removes subjects, with the page they came from.",
  },
  {
    title: "Fits subject-removal deadlines",
    text: "Standard reviews come back within 1 business day. Add Rush when the deadline is tight.",
  },
  {
    title: "Plain English your buyer will read",
    text: "A clear rating, the top findings and a short list of questions to ask the strata manager.",
  },
  {
    title: "Reviewed by an appraiser",
    text: "On Expert Reviewed orders, Brian Hill (B.Comm., DAR, DRP, CRP), an appraiser since 1986, checks every finding before it is sent.",
  },
];

const steps = [
  "Order online and enter your buyer's name and email, so the report goes straight to them. Or enter your own email if you'd rather pass it on.",
  "Upload the strata documents from the seller: Form B, minutes, financials, depreciation report, bylaws and insurance.",
  "The PDF report arrives by email, usually within 1 business day.",
];

export default function ForRealtorsPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">For BC realtors</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
            Strata document reviews for your buyers
          </h1>
          <p className="mt-5 text-lg leading-8 text-silver-200">
            Strata packages run to hundreds of pages. We read every page and give your buyer a
            plain-English summary of the costs and risks before subject removal.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/order" className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500">
              Order a review
            </Link>
            <Link href="/sample-report" className="rounded-lg px-6 py-3 font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">
              See a sample report
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">Why realtors use it</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {reasons.map((r) => (
              <div key={r.title} className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
                <h3 className="font-semibold text-navy-900">{r.title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">How to order for a client</h2>
          <ol className="mt-6 list-decimal space-y-3 pl-6 leading-7 text-slate-700">
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p className="mt-6 text-sm leading-6 text-slate-500">
            {reviewScope.short} Questions:{" "}
            <a className="underline" href={`mailto:${site.email}`}>{site.email}</a>.
          </p>
        </div>
      </section>

      <section className="bg-navy-900 text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Need an appraisal too?</h2>
          <p className="mt-4 text-lg leading-8 text-silver-200">
            Our sister company, {sisterCompany.name}, has the same owner and provides:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-silver-200">
            {sisterCompany.services.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="mt-4 leading-7 text-silver-200">
            Useful for pricing support on a listing, an independent value for a buyer, or a strata
            council whose depreciation report or insurance appraisal is due.
          </p>
          <a
            href={sisterLink("for_realtors")}
            className="mt-8 inline-block rounded-lg bg-white px-6 py-3 font-semibold text-navy-900 hover:bg-silver-200"
          >
            Visit DreamHomeGroup.ca
          </a>
        </div>
      </section>
    </>
  );
}
