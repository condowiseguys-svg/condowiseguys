import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { founder, site, sisterCompany, sisterLink } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Brian Hill: appraiser and reserve planner",
  description:
    "Condo Wise Guys is owned by Brian A. Hill, B.Comm., DAR, DRP, CRP, an appraiser since 1986 who has prepared depreciation reports for BC strata corporations since 2012.",
  alternates: { canonical: "/about" },
};

function List({ title, items }: { title: string; items: React.ReactNode[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
      <h3 className="font-semibold text-navy-900">{title}</h3>
      <ul className="mt-3 space-y-2 leading-7 text-slate-700">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export default function AboutPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="mx-auto flex max-w-4xl flex-col items-start gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center md:py-20">
          <Image
            src="/logo.png"
            alt="Condo Wise Guys logo"
            width={160}
            height={160}
            className="h-28 w-28 shrink-0 rounded-2xl ring-1 ring-white/15 md:h-36 md:w-36"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">About us</p>
            <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">{founder.name}</h1>
            <p className="mt-2 text-lg font-semibold text-silver-200">{founder.designations}</p>
            <p className="mt-4 text-lg leading-8 text-silver-200">{founder.summary}</p>
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-16 text-lg leading-8 text-slate-700 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">Background</h2>
          {founder.history.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-navy-900">Qualifications</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <List
              title="Professional designations"
              items={founder.designationsHeld.map((d) => (
                <>
                  <span className="font-medium text-navy-900">{d.name}</span>
                  <span className="block text-sm text-slate-500">{d.from}</span>
                </>
              ))}
            />
            <List title="Education" items={founder.education} />
            <List title="Current roles" items={founder.current} />
            <List title="Past experience" items={founder.past} />
          </div>
        </div>
      </section>

      <section className="bg-navy-900 text-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Want Brian to check your review?</h2>
          <p className="mt-4 text-lg leading-8 text-silver-200">
            Choose Expert Reviewed when you order, or upgrade from Standard later and pay only the
            difference. Brian checks every finding before the report is sent, then talks the findings
            through with you on a call. For appraisals and depreciation reports, visit our sister company,{" "}
            <a href={sisterLink("about")} className="font-semibold text-white underline">
              {sisterCompany.name}
            </a>
            , which has the same owner.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/order" className="rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500">
              Order a review
            </Link>
            <a
              href={`mailto:${site.email}`}
              className="rounded-lg px-6 py-3 font-semibold text-white ring-1 ring-white/30 hover:bg-white/10"
            >
              Email {site.email}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
