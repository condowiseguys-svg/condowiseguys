import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Condo Wise Guys collects, uses, stores and deletes your information.",
};

const CONTACT = "report@condowiseguys.com";
const UPDATED = "November 19, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-navy-900">{title}</h2>
      <div className="space-y-3 text-slate-700 leading-7">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-12 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-navy-900">Privacy policy</h1>
        <p className="text-sm text-slate-500">Last updated {UPDATED}</p>
      </header>

      <Section title="Who we are">
        <p>
          Condo Wise Guys reviews strata documents for home buyers in British Columbia. We follow
          BC&apos;s Personal Information Protection Act and, where it applies, Canada&apos;s Personal
          Information Protection and Electronic Documents Act. Questions about privacy go to our
          privacy contact at <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Section>

      <Section title="What we collect">
        <p>
          Your name, email, phone number, the property address and unit, your subject removal date
          and any notes you add; confirmation that you paid; and the strata documents you upload.
          Card details are handled by Stripe and never seen or stored by us.
        </p>
        <p>
          Strata documents can include information about other people, such as owners named in
          council minutes. We use it only to prepare your review.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          Only to prepare and deliver your document review, take payment, keep a record of what we
          delivered, and answer your questions. We do not sell your information, use it for
          advertising, or use your documents for anything else.
        </p>
      </Section>

      <Section title="Who helps us, and where your information goes">
        <p>We use trusted service providers to run the service:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Vercel (website), with the website running in Montréal, Canada</li>
          <li>Supabase (database and document storage), in Canada (Central)</li>
          <li>Trigger.dev (document processing), in the United States</li>
          <li>Anthropic (AI analysis of your documents), in the United States</li>
          <li>Resend (email delivery), in the United States</li>
          <li>Stripe (payments), in Canada and the United States</li>
        </ul>
        <p>
          Some of these providers process or store information in the United States, where it may
          be accessible to courts, law enforcement and national security authorities under US law.
          Each provider is bound by contract to protect your information and use it only to provide
          its service to us. Our AI provider does not use your documents to train its models.
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul className="list-disc space-y-1 pl-6">
          <li>Uploaded documents are deleted automatically 90 days after your report is delivered.</li>
          <li>
            Your report and order record are deleted 2 years after delivery. At that point we also
            erase your name and contact details from the order, keeping only the amount and dates
            as a business record.
          </li>
          <li>Orders that are cancelled or never paid follow the same schedule from the order date.</li>
        </ul>
      </Section>

      <Section title="How we protect it">
        <p>
          Documents are stored privately and encrypted. Upload links are unique to your order, our
          keys and analysis run only on our servers, and only the owner can see orders and reports.
          If a breach ever creates a real risk of significant harm to you, we will tell you and
          report it to the Privacy Commissioner as the law requires.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <p>
          You can ask to see the information we hold about you, ask us to correct it, or withdraw
          your consent (which may mean we can&apos;t complete a review), by emailing{" "}
          <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>. If you&apos;re not satisfied
          with our answer, you can contact the Office of the Information and Privacy Commissioner
          for British Columbia.
        </p>
      </Section>
    </div>
  );
}
