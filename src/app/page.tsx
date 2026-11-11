import Link from "next/link";
import { buttonPrimary } from "@/components/ui";
import { QUICK_SCAN, formatMoney } from "@/lib/config";

const steps = [
  ["Order", "Choose Quick Scan and pay securely by card."],
  ["Upload", "Send us the strata package: minutes, financials, depreciation report, bylaws."],
  ["Review", "A real person checks and approves every report before it is released."],
  ["Download", "Sign in to collect your report. It is never sent as an email attachment."],
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-brand-dark">
          Know what you are buying into before you buy the condo.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          Strata packages run to hundreds of pages. We read them and tell you, in plain language, what stands out.
        </p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold">{QUICK_SCAN.name}</h2>
          <p className="mt-1 text-slate-600 max-w-xl">{QUICK_SCAN.description}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="text-3xl font-semibold">{formatMoney(QUICK_SCAN.priceCents, QUICK_SCAN.currency)}</div>
          <Link href="/order/quick-scan" className={`${buttonPrimary} mt-3`}>
            Order a Quick Scan
          </Link>
        </div>
      </section>

      <section>
        <h2 className="font-semibold mb-4">How it works</h2>
        <ol className="grid sm:grid-cols-4 gap-4">
          {steps.map(([title, text], i) => (
            <li key={title} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="text-xs font-mono text-accent">Step {i + 1}</div>
              <div className="font-medium mt-1">{title}</div>
              <p className="text-sm text-slate-600 mt-1">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
