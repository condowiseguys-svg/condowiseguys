import { notFound } from "next/navigation";
import { resumePayment, submitDocuments } from "@/app/actions";
import { FileList } from "@/components/FileList";
import { SubmitButton } from "@/components/SubmitButton";
import { Uploader } from "@/components/Uploader";
import { Card, PaymentBadge, StatusBadge, buttonPrimary } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ALLOWED_EXTENSIONS, formatDate, formatMoney } from "@/lib/config";
import { getOrder, reconcilePayment, shortId } from "@/lib/orders";

export const metadata = { title: "Your order · Condo Wise Guys" };

const accept = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { id } = await params;
  const { cancelled } = await searchParams;
  const user = await requireUser(`/orders/${id}`);

  let order = await getOrder(id);
  if (!order || order.user_id !== user.id) notFound();

  // Back from Stripe before the webhook arrived? Confirm with Stripe directly.
  if (await reconcilePayment(order)) {
    order = (await getOrder(id))!;
  }

  const packages = order.order_files?.filter((f) => f.kind === "package") ?? [];
  // The report only reaches the customer's page after the admin has approved it.
  const reports =
    order.status === "delivered" ? (order.order_files?.filter((f) => f.kind === "report") ?? []) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Quick Scan · {order.property}</h1>
          <p className="text-sm text-slate-500 mt-1">
            Order {shortId(order.id)} · placed {formatDate(order.created_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <PaymentBadge status={order.payment_status} />
          <StatusBadge status={order.status} />
        </div>
      </div>

      {order.status === "awaiting_payment" && (
        <Card title="1. Payment">
          {cancelled && <p className="text-sm text-amber-800 mb-3">Checkout was cancelled. Nothing was charged.</p>}
          <p className="text-sm text-slate-600 mb-4">
            Pay {formatMoney(order.amount_cents, order.currency)} to start your Quick Scan.
          </p>
          <form action={resumePayment}>
            <input type="hidden" name="order_id" value={order.id} />
            <SubmitButton className={buttonPrimary} pendingText="Opening secure checkout…">
              Pay now
            </SubmitButton>
          </form>
        </Card>
      )}

      {order.payment_status !== "unpaid" && (
        <Card title="1. Payment">
          <p className="text-sm">
            {order.payment_status === "refunded" ? "Refunded" : "Paid"}{" "}
            {formatMoney(order.amount_cents, order.currency)}
            {order.paid_at && ` on ${formatDate(order.paid_at)}`}.
          </p>
        </Card>
      )}

      {(order.status === "awaiting_documents" || order.status === "in_review" || order.status === "delivered") && (
        <Card title="2. Your strata package">
          <FileList
            files={packages}
            canDelete={order.status === "awaiting_documents"}
            empty="No documents uploaded yet."
          />
          {order.status !== "delivered" && (
            <div className="mt-4">
              <Uploader
                orderId={order.id}
                kind="package"
                accept={accept}
                label={packages.length ? "Add more documents" : "Choose the documents in your strata package"}
              />
            </div>
          )}
          {order.status === "awaiting_documents" && packages.length > 0 && (
            <form action={submitDocuments} className="mt-5 pt-5 border-t border-slate-100">
              <input type="hidden" name="order_id" value={order.id} />
              <SubmitButton className={buttonPrimary} pendingText="Submitting…">
                That is everything. Start my review
              </SubmitButton>
            </form>
          )}
          {order.status === "in_review" && (
            <p className="mt-4 text-sm text-slate-600">
              Submitted {formatDate(order.submitted_at)}. You can still add a document you forgot.
            </p>
          )}
        </Card>
      )}

      {(order.status === "in_review" || order.status === "delivered") && (
        <Card title="3. Your report">
          {order.status === "delivered" ? (
            <>
              <p className="text-sm text-slate-600 mb-3">
                Released {formatDate(order.approved_at)}. Download links are private to your account and expire
                after one minute, so please do not share them.
              </p>
              <FileList files={reports} empty="Your report file is missing. Please contact us." />
            </>
          ) : (
            <p className="text-sm text-slate-600">
              We are reviewing your documents. Your report will appear here once it has been approved, and we
              will let you know by email.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
