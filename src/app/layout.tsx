import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import Link from "next/link";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/config";
import { stripeIsTestMode } from "@/lib/stripe";
import "./globals.css";

// Every page shows who is signed in, so nothing is ever prerendered or cached across visitors.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Condo Wise Guys",
  description: "Strata document reviews in plain language.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();
  const admin = isAdminEmail(user?.email);

  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased min-h-screen flex flex-col`}>
        {stripeIsTestMode() && (
          <div className="bg-amber-100 text-amber-900 text-center text-xs py-1.5 px-4">
            Test mode. No real payments are taken. Use card 4242 4242 4242 4242, any future date, any CVC.
          </div>
        )}
        <header className="bg-white border-b border-slate-200">
          <div className="mx-auto max-w-5xl px-5 h-16 flex items-center justify-between gap-4">
            <Link href="/" className="font-semibold text-lg text-brand tracking-tight">
              Condo Wise Guys
            </Link>
            <nav className="flex items-center gap-5 text-sm">
              {admin && (
                <Link href="/admin" className="font-medium text-brand hover:underline">
                  Dashboard
                </Link>
              )}
              {user ? (
                <>
                  <Link href="/orders" className="hover:underline">
                    My orders
                  </Link>
                  <form action="/auth/signout" method="post">
                    <button className="text-slate-500 hover:text-slate-900 cursor-pointer">Sign out</button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="hover:underline">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">{children}</main>
        <footer className="border-t border-slate-200 text-xs text-slate-500 py-6 text-center">
          © {new Date().getFullYear()} Condo Wise Guys · Kelowna, BC
        </footer>
      </body>
    </html>
  );
}
