import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://condowiseguys.com"),
  title: {
    default: "Condo Wise Guys | BC Strata Document Reviews",
    template: "%s | Condo Wise Guys",
  },
  description:
    "Buying a condo in BC? We review your Form B, depreciation report, minutes, bylaws, financials and insurance, and tell you what could cost you money before you remove subjects.",
  openGraph: {
    title: "Condo Wise Guys | BC Strata Document Reviews",
    description:
      "Plain-English reviews of BC strata documents, with risk ratings and estimated special levy exposure.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-CA">
      <body className={`${inter.variable} antialiased`}>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
