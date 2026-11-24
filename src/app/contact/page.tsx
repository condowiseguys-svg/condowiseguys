import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Questions about a BC strata document review? Send Condo Wise Guys a message and we will reply by email.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <section className="bg-gradient-to-b from-navy-900 to-navy-800 text-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">Contact us</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">Questions? We&apos;re happy to help.</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-silver-200">
            Ask about a review, an order you&apos;ve placed, or working with us as a realtor. We
            usually reply within one business day.
          </p>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-5xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <h2 className="text-2xl font-bold tracking-tight text-navy-900">Send us a message</h2>
            <div className="mt-6">
              <ContactForm />
            </div>
          </div>

          <aside className="space-y-6 text-slate-700">
            {site.mailingAddress && (
              <div className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
                <h2 className="font-semibold text-navy-900">Mailing address</h2>
                <p className="mt-2 leading-7">{site.mailingAddress}</p>
                <p className="mt-1 text-sm text-slate-500">Mail only: we don&apos;t have a walk-in office.</p>
              </div>
            )}
            <div className="rounded-xl bg-slate-50 p-6 ring-1 ring-slate-200">
              <h2 className="font-semibold text-navy-900">Ready to order?</h2>
              <p className="mt-2 leading-7">
                You don&apos;t need to contact us first. Order online and upload your strata documents
                right after paying.
              </p>
              <Link href="/order" className="mt-3 inline-block font-semibold text-brand-600 hover:underline">
                Order a review
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
