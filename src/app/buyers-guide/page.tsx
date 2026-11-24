import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buyersGuide, founder } from "@/lib/site";

export const metadata: Metadata = {
  title: "Free Condo Buyers Guide for BC strata buyers",
  description:
    "Download the free 51-page Condo Buyers Guide: how to read a BC strata package, including Form B, the depreciation report, minutes, financials, bylaws and insurance, with red flag checklists.",
  alternates: { canonical: buyersGuide.pagePath },
  openGraph: {
    title: "Free Condo Buyers Guide | Condo Wise Guys",
    description: "How to read the strata documents before you buy a condo in BC. Free 51-page PDF.",
    images: [buyersGuide.coverPath],
  },
};

const inside = [
  { title: "How strata ownership works", text: "Strata lots, common and limited common property, council, fees and special levies." },
  { title: "When to review the documents", text: "The buying timeline, the rescission period and how to word your subject clause." },
  { title: "Form B, item by item", text: "What each line of the Information Certificate tells you, and its red flags." },
  { title: "The depreciation report", text: "Five numbers to pull out, and how to estimate your share of a shortfall." },
  { title: "Minutes, financials and insurance", text: "Where the real story is, what to search for, and the water damage deductible." },
  { title: "Red flags and decisions", text: "Special situations, then how to turn what you find into questions, numbers and a decision." },
];

const appendices = [
  "Document request checklist",
  "Questions to ask the strata manager",
  "Minutes keyword search list",
  "Red flag scorecard",
  "Glossary",
];

function DownloadButton({ className }: { className: string }) {
  return (
    <a href={buyersGuide.pdfPath} download={buyersGuide.fileName} className={className}>
      Download the free guide (PDF)
    </a>
  );
}

export default function BuyersGuidePage() {
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_auto] md:py-20">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm text-brand-300 ring-1 ring-white/15">
              Free download · {buyersGuide.pages} pages · BC edition
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              The {buyersGuide.title}
            </h1>
            <p className="mt-3 text-xl text-silver-200">{buyersGuide.subtitle}</p>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-silver-200">
              Everything we look for when we review a strata package, written for buyers. Learn
              what Form B, the depreciation report and the minutes can tell you before you remove
              subjects. No sign-up needed.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <DownloadButton className="rounded-lg bg-brand-600 px-6 py-3 text-center font-semibold hover:bg-brand-500" />
              <Link
                href="/order"
                className="rounded-lg px-6 py-3 text-center font-semibold ring-1 ring-white/30 hover:bg-white/10"
              >
                Or have us review your package
              </Link>
            </div>
          </div>
          <Image
            src={buyersGuide.coverPath}
            alt={`Cover of the ${buyersGuide.title}`}
            width={480}
            height={622}
            className="mx-auto w-56 rounded-md shadow-2xl ring-1 ring-black/10 sm:w-64"
            priority
          />
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">What&apos;s inside</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {inside.map((i) => (
              <div key={i.title} className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
                <h3 className="font-semibold text-navy-900">{i.title}</h3>
                <p className="mt-2 leading-7 text-slate-600">{i.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 font-semibold text-navy-900">Plus checklists you can use on your own purchase:</p>
          <ul className="mt-3 grid gap-2 text-slate-700 sm:grid-cols-2">
            {appendices.map((a) => (
              <li key={a} className="flex gap-2">
                <span aria-hidden className="text-brand-600">✓</span>
                {a}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-sm leading-6 text-slate-500">
            Written by {founder.name}, {founder.designations}. {founder.summary} Free to share with
            your partner, co-buyers, realtor and lawyer.
          </p>
        </div>
      </section>

      <section className="bg-navy-900 text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Short on time before subject removal?</h2>
          <p className="mt-4 text-lg leading-8 text-silver-200">
            A strata package can run to hundreds of pages. Upload it and we&apos;ll read every page
            for you, using the same checklists as this guide. You get a plain-English report with
            red, amber and green ratings, page references, your estimated special levy exposure
            and the questions to ask, usually within 1 business day.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/order"
              className="rounded-lg bg-brand-600 px-6 py-3 text-center font-semibold text-white hover:bg-brand-500"
            >
              Order a review
            </Link>
            <Link
              href="/sample-report"
              className="rounded-lg px-6 py-3 text-center font-semibold text-white ring-1 ring-white/30 hover:bg-white/10"
            >
              See a sample report
            </Link>
          </div>
          <p className="mt-6 text-sm text-silver-200/80">Every review comes with a copy of this guide.</p>
        </div>
      </section>

      <section className="bg-brand-100">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold text-navy-900">Prefer to read it yourself first?</h2>
            <p className="mt-2 text-slate-700">The full guide, free, as a PDF you can print.</p>
          </div>
          <DownloadButton className="rounded-lg bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-800" />
        </div>
      </section>
    </>
  );
}
