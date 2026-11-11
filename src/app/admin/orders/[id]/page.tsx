import Link from "next/link";
import { notFound } from "next/navigation";
import { approveAndRelease } from "@/app/actions";
import { FileList } from "@/components/FileList";
import { SubmitButton } from "@/components/SubmitButton";
import { Uploader } from "@/components/Uploader";
import { Card, PaymentBadge, StatusBadge, buttonPrimary } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/config";
import { getOrder, reconcilePayment, shortId } from "@/lib/orders";

export const metadata = { title: "Order · Dashboard · Condo Wise Guys" };
export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-1.5 text-sm">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className="text-right break-all">{children}</dd>
    </div>
  );
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/orders/${id}`);

  let order = await getOrder(id);
  if (!order) notFound();
  if (await reconcilePayment(order)) order = (await getOrder(id))!;

  const packages = order.order_files?.filter((f) => f.kind === "package") ?? [];
  const reports = order.order_files?.filter((f) => f.kind === "report") ?? [];
  const delivered = order.status === "delivered";
  const canApprove = !delivered && order.payment_status === "paid" && reports.length > 0;
  const stripeBase = `https://dashboard.stripe.com${order.stripe_livemode ? "" : "/test"}`;

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← All orders
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Order {shortId(order.id)}</h1>
          <p className="text-sm text-slate-500 mt-1">{order.property}</p>
        </div>
        <div className="flex gap-2">
          <PaymentBadge status={order.payment_status} />
          <StatusBadge status={order.status} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Customer">
          <dl>
            <Row label="Name">{order.customer_name}</Row>
            <Row label="Email">{order.email}</Row>
            <Row label="Property">{order.property}</Row>
            <Row label="Ordered">{formatDate(order.created_at)}</Row>
            <Row label="Documents submitted">{formatDate(order.submitted_at) || "Not yet"}</Row>
          </dl>
          {order.notes && (
            <p className="mt-3 text-sm bg-slate-50 rounded-lg p-3 whitespace-pre-wrap">{order.notes}</p>
          )}
        </Card>

        <Card title="Payment">
          <dl>
            <Row label="Status">
              <PaymentBadge status={order.payment_status} />
            </Row>
            <Row label="Amount">{formatMoney(order.amount_cents, order.currency)}</Row>
            <Row label="Paid">{formatDate(order.paid_at) || "Not yet"}</Row>
            <Row label="Mode">{order.paid_at ? (order.stripe_livemode ? "Live" : "Test") : "—"}</Row>
            <Row label="Stripe payment">
              {order.stripe_payment_intent_id ? (
                <a
                  className="text-brand hover:underline font-mono text-xs"
                  href={`${stripeBase}/payments/${order.stripe_payment_intent_id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {order.stripe_payment_intent_id}
                </a>
              ) : (
                "—"
              )}
            </Row>
          </dl>
        </Card>
      </div>

      <Card title={`Uploaded strata package (${packages.length})`}>
        <FileList files={packages} empty="The customer has not uploaded anything yet." />
      </Card>

      <Card title="Report">
        <FileList files={reports} canDelete={!delivered} empty="No report attached yet." />
        {delivered ? (
          <p className="mt-4 text-sm text-emerald-800">
            Approved and released {formatDate(order.approved_at)} by {order.approved_by}. The customer can now
            download it.
          </p>
        ) : (
          <>
            <div className="mt-4">
              <Uploader orderId={order.id} kind="report" accept=".pdf,.docx,.doc" label="Attach the finished report" />
            </div>
            <form action={approveAndRelease} className="mt-5 pt-5 border-t border-slate-100">
              <input type="hidden" name="order_id" value={order.id} />
              <SubmitButton
                className={buttonPrimary}
                pendingText="Releasing…"
                disabled={!canApprove}
                confirm="Release this report to the customer? They will be able to download it straight away."
              >
                Approve and release to customer
              </SubmitButton>
              {!canApprove && (
                <p className="mt-2 text-xs text-slate-500">
                  {order.payment_status !== "paid"
                    ? "The order must be paid before a report can be released."
                    : "Attach the report first."}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Until you approve, the customer cannot see or download the report.
              </p>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
