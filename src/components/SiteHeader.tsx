import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#what-we-review", label: "What we review" },
  { href: "/sample-report", label: "Sample report" },
  { href: "/#pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-900/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Image
            src="/logo.png"
            alt="Condo Wise Guys logo"
            width={48}
            height={48}
            className="h-11 w-11 shrink-0 rounded-md sm:h-12 sm:w-12"
            priority
          />
          <span className="truncate text-lg font-semibold tracking-tight text-white">
            Condo Wise Guys
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-silver-200 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/order"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500"
        >
          Order a review
        </Link>
      </div>
    </header>
  );
}
