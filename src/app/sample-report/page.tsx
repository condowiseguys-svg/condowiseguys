import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { RiskBadge, type Risk } from "@/components/RiskBadge";

export const metadata: Metadata = {
  title: "Sample report",
  description:
    "An excerpt from a real Condo Wise Guys review of a BC strata disclosure package, with identifying details removed.",
};

const findings: { n: number; text: string; risk: Risk; source: string }[] = [
  {
    n: 1,
    text: "The depreciation report forecasts special levies of $7.5M (2026), $17.5M (2027) and $7.9M (2028) under current funding. The engineer says levies are unlikely to be avoided.",
    risk: "red",
    source: "p. 429-433",
  },
  {
    n: 2,
    text: "Only the joint strata's records were provided. The Residential Section's fees, budget and levies are unknown.",
    risk: "red",
    source: "p. 162",
  },
  {
    n: 3,
    text: "The water damage deductible is $75,000, and the bylaws let the strata charge it to the owner whose unit caused the loss.",
    risk: "amber",
    source: "p. 403, bylaw 32(2)",
  },
  {
    n: 4,
    text: "Operating deficit of $157,215 after 11 months, driven by water and sewer costs running 68% over budget. Expect a fee increase.",
    risk: "amber",
    source: "p. 396-399",
  },
  {
    n: 5,
    text: "All three elevators in this unit's tower are being modernized one at a time through November 2026.",
    risk: "amber",
    source: "p. 163",
  },
  {
    n: 6,
    text: "No special levy currently approved, and the seller owes nothing to the strata.",
    risk: "green",
    source: "Form B, p. 3",
  },
];

const levies = [
  { year: "2026", strata: "$7,487,425", unit: "about $10,900" },
  { year: "2027", strata: "$17,451,879", unit: "about $25,500" },
  { year: "2028", strata: "$7,922,261", unit: "about $11,600" },
  { year: "Total", strata: "$32,861,565", unit: "about $48,000" },
];

const sections = [
  "Cover and scope, including documents missing from the package",
  "Executive summary with the overall rating and top findings",
  "Form B, line by line",
  "Financial health: budget, fees, operating results, reserves",
  "Depreciation report and estimated special levies for the unit",
  "Meeting minutes: projects, leaks, disputes",
  "Bylaws and rules that affect the buyer",
  "Insurance coverage and deductibles",
  "Questions to ask before removing subjects",
];

export default function SampleReport() {
  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Sample report</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl">
          What you get: an excerpt from a real review
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          This is the summary page of a review we prepared from a 735-page disclosure
          package for a unit in a 535-lot Vancouver strata built in 1998. The address and
          names have been removed.
        </p>

        <article className="mt-10 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-4 bg-navy-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Image src="/logo.png" alt="Condo Wise Guys logo" width={56} height={56} className="rounded-md" />
              <div>
                <p className="text-sm text-brand-300">Strata Document Review</p>
                <p className="font-semibold">Unit in a 535-lot Vancouver strata</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              Overall rating <RiskBadge risk="red" />
            </div>
          </div>

          <div className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-navy-900">Executive summary</h2>
            <p className="mt-3 leading-7 text-slate-700">
              <strong>Overall rating: red, plan for large special levies.</strong> The building
              is well run day to day, but its engineer forecasts about $33 million of roof,
              envelope, piping and elevator work in 2026 to 2028, far more than the roughly
              $2 million in the contingency reserve. On this unit&apos;s share, special
              levies of about <strong>$48,000 over three years</strong> are possible under the
              current funding plan.
            </p>

            <ul className="mt-6 divide-y divide-slate-100">
              {findings.map((f) => (
                <li key={f.n} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4">
                  <span className="hidden w-6 shrink-0 font-semibold text-slate-400 sm:block">{f.n}</span>
                  <p className="flex-1 leading-6 text-slate-800">{f.text}</p>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <RiskBadge risk={f.risk} />
                    <span className="text-xs text-slate-500">{f.source}</span>
                  </div>
                </li>
              ))}
            </ul>

            <h2 className="mt-10 text-xl font-semibold text-navy-900">Estimated special levies for this unit</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Year</th>
                    <th className="py-2 pr-4 font-medium">Forecast levy, whole strata</th>
                    <th className="py-2 font-medium">Estimated share for this unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {levies.map((l) => (
                    <tr key={l.year} className={l.year === "Total" ? "font-semibold text-navy-900" : ""}>
                      <td className="py-2 pr-4">{l.year}</td>
                      <td className="py-2 pr-4">{l.strata}</td>
                      <td className="py-2">{l.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Estimated from the depreciation report&apos;s current funding scenario and the
              unit&apos;s share of unit entitlement. Actual levies depend on owner votes, how
              costs are split between sections, and final prices.
            </p>
          </div>
        </article>

        <div className="mt-10 rounded-2xl bg-white p-6 ring-1 ring-slate-200 sm:p-8">
          <h2 className="text-xl font-semibold text-navy-900">The full report also covers</h2>
          <ul className="mt-4 grid gap-2 text-slate-700 sm:grid-cols-2">
            {sections.map((s) => (
              <li key={s} className="flex gap-2 text-sm leading-6">
                <span aria-hidden className="text-brand-600">✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Link href="/order" className="rounded-lg bg-brand-600 px-6 py-3 text-center font-semibold text-white hover:bg-brand-500">
            Order a review
          </Link>
          <Link href="/#pricing" className="rounded-lg px-6 py-3 text-center font-semibold text-navy-900 ring-1 ring-slate-300 hover:bg-white">
            See pricing
          </Link>
        </div>
      </div>
    </div>
  );
}
