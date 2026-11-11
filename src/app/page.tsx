import Image from "next/image";
import Link from "next/link";
import { RiskBadge, type Risk } from "@/components/RiskBadge";
import { formatPrice, rushAddOn, tiers } from "@/lib/site";

const previewFindings: { text: string; risk: Risk }[] = [
  {
    text: "Engineer forecasts $33M of roof and piping work in 2026 to 2028",
    risk: "red",
  },
  {
    text: "Estimated special levies for this unit: about $48,000",
    risk: "red",
  },
  {
    text: "$75,000 water damage deductible can be charged to the owner",
    risk: "amber",
  },
  { text: "No approved special levies, seller owes $0", risk: "green" },
];

const steps = [
  {
    title: "Order and pay",
    body: "Choose a review, enter the address and your subject-removal date, and pay securely by card.",
  },
  {
    title: "Upload your package",
    body: "Drop in the PDFs from your realtor or strata manager. Packages of 700+ pages are fine.",
  },
  {
    title: "We review every page",
    body: "Our system reads the full package, including scanned pages, and checks it against a BC strata checklist.",
  },
  {
    title: "Get your report",
    body: "A plain-English PDF with a risk rating, the key numbers, page references and questions to ask.",
  },
];

const documents = [
  {
    name: "Form B Information Certificate",
    note: "Fees, amounts owing, levies, lawsuits, parking and lockers",
  },
  {
    name: "Depreciation report",
    note: "Upcoming repairs, reserve fund health, likely special levies",
  },
  {
    name: "Council, AGM and SGM minutes",
    note: "Leaks, disputes, projects and levies being discussed",
  },
  {
    name: "Financial statements and budget",
    note: "Deficits, overspending, fee increases, arrears",
  },
  {
    name: "Bylaws and rules",
    note: "Rentals, short-term rentals, pets, age limits, renovations",
  },
  {
    name: "Insurance summary",
    note: "Deductibles you could be charged and the coverage you need",
  },
  {
    name: "Engineering and envelope reports",
    note: "Building condition, warranty and remediation history",
  },
  {
    name: "Legal disclosures and strata plan",
    note: "Tribunal and court claims, parking and storage allocation",
  },
];

const faqs = [
  {
    q: "Is this legal advice or a home inspection?",
    a: "No. It is a careful review of the strata documents, written for buyers. We recommend you also use a lawyer or notary, a home inspector and an insurance broker.",
  },
  {
    q: "Which properties do you review?",
    a: "Strata properties in British Columbia: apartments, townhouses and mixed-use buildings. We are adding other Canadian provinces later.",
  },
  {
    q: "What if documents are missing from my package?",
    a: "Your report lists what is missing or out of date, and the questions to ask so you can get it before your subject-removal date.",
  },
  {
    q: "What happens to my documents?",
    a: "They are stored privately in Canada, used only to prepare your report, and never used to train AI models. We keep a sealed copy of the documents and the final report as the record of what we reviewed.",
  },
  {
    q: "How is the special levy estimate worked out?",
    a: "We take the costs and levies forecast in the strata's own depreciation report and minutes and apply your unit's share of unit entitlement. It is an estimate, and the report explains what it depends on.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
          <div>
            <p className="inline-flex rounded-full bg-white/10 px-3 py-1 text-sm text-brand-300 ring-1 ring-white/15">
              For condo and townhouse buyers in BC
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Know what the strata documents say before you remove subjects
            </h1>
            <p className="mt-5 text-lg leading-8 text-silver-200">
              We read the whole package (Form B, depreciation report, minutes,
              bylaws, financials and insurance) and tell you, in plain English,
              what could cost you money.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/order"
                className="rounded-lg bg-brand-600 px-6 py-3 text-center font-semibold hover:bg-brand-500"
              >
                Order a review
              </Link>
              <Link
                href="/sample-report"
                className="rounded-lg px-6 py-3 text-center font-semibold ring-1 ring-white/30 hover:bg-white/10"
              >
                See a sample report
              </Link>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-2xl ring-1 ring-black/5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sample report summary
                </p>
                <p className="mt-1 font-semibold">
                  535-unit Vancouver strata, 1998
                </p>
              </div>
              <RiskBadge risk="red" />
            </div>
            <ul className="mt-5 space-y-3">
              {previewFindings.map((f) => (
                <li
                  key={f.text}
                  className="flex items-start justify-between gap-3 text-sm leading-6"
                >
                  <span>{f.text}</span>
                  <RiskBadge risk={f.risk} />
                </li>
              ))}
            </ul>
            <Link
              href="/sample-report"
              className="mt-5 inline-block text-sm font-semibold text-brand-600 hover:underline"
            >
              Read the sample →
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">
            How it works
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="rounded-xl border border-slate-200 p-6"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-600">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-semibold text-navy-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What we review */}
      <section id="what-we-review" className="scroll-mt-20 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">
            What we review
          </h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            Every document in a typical BC disclosure package, and we tell you
            what is missing.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {documents.map((d) => (
              <div
                key={d.name}
                className="rounded-xl bg-white p-5 ring-1 ring-slate-200"
              >
                <h3 className="font-semibold text-navy-900">{d.name}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {d.note}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">
            Pricing
          </h2>
          <p className="mt-3 text-slate-600">
            One price per property, in Canadian dollars, plus GST.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {tiers.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col rounded-2xl p-6 sm:p-8 ${
                  t.highlight
                    ? "bg-navy-900 text-white ring-2 ring-brand-500"
                    : "ring-1 ring-slate-200"
                }`}
              >
                <h3 className="text-xl font-semibold">{t.name}</h3>
                <p
                  className={`mt-1 text-sm ${t.highlight ? "text-brand-300" : "text-slate-500"}`}
                >
                  {t.turnaround}
                </p>
                <p className="mt-4 text-3xl font-bold">
                  {formatPrice(t.priceCad)}
                </p>
                <p
                  className={`mt-4 text-sm leading-6 ${t.highlight ? "text-silver-200" : "text-slate-600"}`}
                >
                  {t.summary}
                </p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span
                        aria-hidden
                        className={
                          t.highlight ? "text-brand-300" : "text-brand-600"
                        }
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/order?tier=${t.id}`}
                  className={`mt-8 rounded-lg px-5 py-3 text-center font-semibold ${
                    t.highlight
                      ? "bg-brand-600 text-white hover:bg-brand-500"
                      : "bg-navy-900 text-white hover:bg-navy-800"
                  }`}
                >
                  Choose {t.name}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-slate-600">
            <span className="font-semibold text-navy-900">
              {rushAddOn.name} add-on:
            </span>{" "}
            {rushAddOn.summary} {formatPrice(rushAddOn.priceCad)}.
          </p>
        </div>
      </section>

      {/* About */}
      <section className="bg-navy-900 text-white">
        <div className="mx-auto flex max-w-4xl flex-col items-start gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center md:py-20">
          <Image
            src="/logo.png"
            alt="Condo Wise Guys logo"
            width={160}
            height={160}
            className="h-32 w-32 shrink-0 rounded-2xl ring-1 ring-white/15 md:h-40 md:w-40"
          />
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Who reviews Expert orders
            </h2>
            <p className="mt-5 text-lg leading-8 text-silver-200">
              Brian brings more than 40 years in real estate appraisal and has
              worked in reserve planning since 2012. On Expert Reviewed orders
              he checks every finding, edits the report and adds his own notes
              before it reaches you.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">
            Questions
          </h2>
          <div className="mt-8 divide-y divide-slate-200">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy-900">
                  {f.q}
                  <span
                    aria-hidden
                    className="text-brand-600 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 leading-7 text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-100">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold text-navy-900">
              Subject removal coming up?
            </h2>
            <p className="mt-2 text-slate-700">
              Order now and have your report before your deadline.
            </p>
          </div>
          <Link
            href="/order"
            className="rounded-lg bg-navy-900 px-6 py-3 font-semibold text-white hover:bg-navy-800"
          >
            Order a review
          </Link>
        </div>
      </section>
    </>
  );
}
