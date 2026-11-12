import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderWithToken } from "@/lib/orders";
import { site, tiers } from "@/lib/site";

export const metadata: Metadata = { title: "Order received", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  const order = await getOrderWithToken(id, token);
  if (!order) notFound();
  const tier = tiers.find((t) => t.id === order.tier);

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-24">
        <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-risk-green ring-1 ring-emerald-200">
          Documents received
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-navy-900">Thanks, {order.buyer_name.split(" ")[0]}</h1>
        <p className="mt-4 leading-7 text-slate-600">
          We&apos;re reviewing the documents for <strong>{order.property_address}</strong>. Your{" "}
          {tier ? `${tier.name} report` : "report"} will be emailed to <strong>{order.buyer_email}</strong>
          {tier ? ` (${tier.turnaround.toLowerCase()}${order.rush ? ", with Rush priority" : ""})` : ""}.
        </p>
        <p className="mt-4 leading-7 text-slate-600">
          Missed a document? Email it to{" "}
          <a href={`mailto:${site.email}`} className="font-semibold text-brand-600 hover:underline">
            {site.email}
          </a>{" "}
          and mention your order number: <span className="font-mono text-sm">{order.id.slice(0, 8)}</span>.
        </p>
        <Link href="/" className="mt-8 inline-block font-semibold text-brand-600 hover:underline">
          Back to home
        </Link>
      </div>
    </div>
  );
}
