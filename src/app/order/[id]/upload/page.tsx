import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ensurePaid, getOrderWithToken } from "@/lib/orders";
import { site, tiers } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Uploader } from "./Uploader";

export const metadata: Metadata = { title: "Upload your documents", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; session_id?: string }>;
}) {
  const { id } = await params;
  const { token = "", session_id } = await searchParams;
  let order = await getOrderWithToken(id, token);
  if (!order) notFound();
  order = await ensurePaid(order, session_id);

  if (order.status === "processing" || order.status === "in_review" || order.status === "delivered") {
    redirect(`/order/${order.id}/done?token=${token}`);
  }

  const tier = tiers.find((t) => t.id === order.tier);
  const { data: docs } = await supabaseAdmin()
    .from("order_documents")
    .select("storage_path, file_name, size_bytes")
    .eq("order_id", order.id)
    .order("created_at");

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        {order.status === "paid" ? (
          <>
            <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-risk-green ring-1 ring-emerald-200">
              Payment received
            </p>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-navy-900">Upload your strata documents</h1>
            <p className="mt-3 leading-7 text-slate-600">
              {tier?.name} for <strong>{order.property_address}</strong>. Add everything from your
              disclosure package: Form B, depreciation report, minutes, bylaws and rules, financial
              statements, budget, insurance and any engineering reports. You can come back to this
              page from the link in your confirmation email.
            </p>
            <div className="mt-8">
              <Uploader
                orderId={order.id}
                token={token}
                existing={(docs ?? []).map((d) => ({
                  path: d.storage_path as string,
                  name: d.file_name as string,
                  size: Number(d.size_bytes ?? 0),
                }))}
              />
            </div>
            <p className="mt-8 text-sm text-slate-500">
              Files are stored in Canada, used only for your report, and deleted {site.retentionDays} days
              after delivery.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-navy-900">Waiting for payment confirmation</h1>
            <p className="mt-3 leading-7 text-slate-600">
              We haven&apos;t received confirmation from Stripe yet. Refresh this page in a minute. If
              it still shows this message, email {site.email}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
