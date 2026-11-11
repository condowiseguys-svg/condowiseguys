import type { OrderStatus, PaymentStatus } from "@/lib/orders";

const STATUS_TONE: Record<OrderStatus, string> = {
  awaiting_payment: "bg-slate-100 text-slate-700",
  awaiting_documents: "bg-amber-100 text-amber-900",
  in_review: "bg-sky-100 text-sky-900",
  delivered: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-rose-100 text-rose-900",
};

const STATUS_TEXT: Record<OrderStatus, string> = {
  awaiting_payment: "Awaiting payment",
  awaiting_documents: "Awaiting documents",
  in_review: "In review",
  delivered: "Report delivered",
  cancelled: "Cancelled",
};

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  unpaid: "bg-slate-100 text-slate-700",
  paid: "bg-emerald-100 text-emerald-900",
  refunded: "bg-rose-100 text-rose-900",
};

const PAYMENT_TEXT: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  refunded: "Refunded",
};

const pill = "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`${pill} ${STATUS_TONE[status]}`}>{STATUS_TEXT[status]}</span>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`${pill} ${PAYMENT_TONE[status]}`}>{PAYMENT_TEXT[status]}</span>;
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6">
      {title && <h2 className="font-semibold text-base mb-4">{title}</h2>}
      {children}
    </section>
  );
}

export const buttonPrimary =
  "inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

export const buttonSecondary =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 cursor-pointer";

export const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-brand";
