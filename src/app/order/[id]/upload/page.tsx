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
  searchParams: Promise<{ token?: string; session_id?: string; cancelled?: string }>;
}) {
  const { id } = await params;
  const { token = "", session_id, cancelled } = await searchParams;
  let order = await getOrderWithToken(id, token);
  if (!order) notFound();
  order = await ensurePaid(order, session_id);

  if (["processing", "in_review", "approved", "delivered"].includes(order.status)) {
    redirect(`/order/${order.id}/done?token=${token}`);
  }

  const tier = tiers.find((t) => t.id === order.tier);
  const { data: docs } = await supabaseAdmin()
    .from("order_documents")
    .select("storage_path, file_name, size_bytes, check_status, check_detail")
    .eq("order_id", order.id)
    .order("created_at");
  const { data: issues } =
    order.status === "awaiting_documents"
      ? await supabaseAdmin()
          .from("order_issues")
          .select("id, message")
          .eq("order_id", order.id)
          .eq("buyer_visible", true)
          .is("resolved_at", null)
          .order("created_at")
      : { data: [] };
  const canUpload = order.status === "paid" || order.status === "awaiting_documents";

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 md:py-16">
        {canUpload ? (
          <>
            {order.status === "awaiting_documents" ? (
              <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
                <h2 className="font-semibold text-navy-900">We need a bit more before we can finish</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {(issues ?? []).map((i) => (
                    <li key={i.id as string}>{i.message as string}</li>
                  ))}
                  {!issues?.length && <li>Please add any missing documents, then submit again.</li>}
                </ul>
              </div>
            ) : (
              <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-risk-green ring-1 ring-emerald-200">
                Payment received
              </p>
            )}
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
                  locked: d.check_status === "ok",
                  problem: d.check_status === "unreadable" || d.check_status === "empty" ? (d.check_detail as string) : undefined,
                }))}
              />
            </div>
            <p className="mt-8 text-sm text-slate-500">
              Files are stored privately in Canada and used only for your report. We keep a sealed copy
              with your final report as the record of what we reviewed.
            </p>
          </>
        ) : order.status === "payment_failed" || order.status === "cancelled" || cancelled ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-navy-900">
              {order.status === "payment_failed"
                ? "Your payment didn't go through"
                : order.status === "cancelled"
                  ? "This checkout expired"
                  : "Payment not completed"}
            </h1>
            <p className="mt-3 leading-7 text-slate-600">
              Your order details are saved. You can pay now with the same or a different card.
            </p>
            <a
              href={`/order/${order.id}/pay?token=${token}`}
              className="mt-6 inline-block rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500"
            >
              Try payment again
            </a>
          </>
        ) : order.status === "refunded" ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-navy-900">This order was refunded</h1>
            <p className="mt-3 leading-7 text-slate-600">Questions? Email {site.email}.</p>
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
