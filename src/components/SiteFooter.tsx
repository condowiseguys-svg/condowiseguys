import Image from "next/image";
import Link from "next/link";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="bg-navy-950 text-silver-200">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="" width={40} height={40} className="rounded-md" />
            <span className="font-semibold text-white">{site.name}</span>
          </div>
          <p className="mt-3 text-sm leading-6">
            Strata document reviews for home buyers in British Columbia.
          </p>
        </div>
        <div className="text-sm leading-7">
          <p className="font-semibold text-white">Explore</p>
          <Link href="/#how-it-works" className="block hover:text-white">How it works</Link>
          <Link href="/sample-report" className="block hover:text-white">Sample report</Link>
          <Link href="/#pricing" className="block hover:text-white">Pricing</Link>
          <Link href="/#faq" className="block hover:text-white">Questions</Link>
        </div>
        <div className="text-sm leading-7">
          <p className="font-semibold text-white">Contact</p>
          <a href={`mailto:${site.email}`} className="block hover:text-white">
            {site.email}
          </a>
          <p>Vancouver, British Columbia</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-xs leading-5 text-silver-200/70 sm:px-6">
          Our reports are document reviews. They are not legal advice, a home
          inspection, an engineering assessment or an appraisal. © {new Date().getFullYear()}{" "}
          {site.name}.
        </p>
      </div>
    </footer>
  );
}
