export function money(cents: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);
}

export function when(iso: string | null | undefined) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Awaiting payment",
  payment_failed: "Payment failed",
  paid: "Paid, no documents",
  processing: "Processing",
  awaiting_documents: "Waiting on buyer",
  in_review: "Expert review",
  approved: "Approved, sending",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const LEVEL_STYLE: Record<string, string> = {
  urgent: "bg-red-50 text-risk-red ring-red-200",
  action: "bg-amber-50 text-amber-800 ring-amber-200",
  watch: "bg-slate-100 text-slate-700 ring-slate-200",
};
