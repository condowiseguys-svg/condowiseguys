import { supabaseAdmin } from "@/lib/supabase/admin";
import { usdToCad } from "./costs";
import { costCad, type OrderCostLine } from "./costs-view";

export type DashboardOrder = {
  id: string;
  created_at: string;
  status: string;
  tier: string;
  rush: boolean;
  amount_cents: number;
  buyer_name: string;
  buyer_email: string;
  property_address: string;
  unit_number: string | null;
  subject_removal_date: string | null;
  paid_at: string | null;
  submitted_at: string | null;
  processing_started_at: string | null;
  documents_checked_at: string | null;
  delivered_at: string | null;
  updated_at: string;
};

export type Attention = { level: "urgent" | "action" | "watch"; reason: string };


const HOUR = 3600_000;
const DAY = 24 * HOUR;


/** Why an order needs Brian, most urgent first. Empty means nothing to do. */
export function attentionFor(o: DashboardOrder, openIssues: { kind: string; message: string; buyer_visible: boolean }[], now = Date.now()) {
  const out: Attention[] = [];
  const since = (t: string | null) => (t ? now - new Date(t).getTime() : 0);

  for (const i of openIssues.filter((i) => !i.buyer_visible)) {
    out.push({ level: i.kind === "dispute" || i.kind === "delivery_failed" ? "urgent" : "action", reason: i.message });
  }
  if (o.status === "in_review") out.push({ level: "action", reason: "Expert review is waiting for you" });
  if (o.status === "processing" && o.documents_checked_at)
    out.push({ level: "action", reason: "Documents checked and ready for the report" });
  if (o.status === "processing" && !o.documents_checked_at && since(o.submitted_at) > 2 * HOUR)
    out.push({ level: "urgent", reason: "Processing looks stuck (over 2 hours)" });
  if (o.status === "approved" && since(o.updated_at) > HOUR)
    out.push({ level: "urgent", reason: "Approved but delivery not confirmed" });
  if (o.status === "paid" && since(o.paid_at) > 2 * DAY)
    out.push({ level: "watch", reason: `Paid ${Math.floor(since(o.paid_at) / DAY)} days ago, no documents yet` });
  if (o.status === "awaiting_documents" && since(o.updated_at) > 3 * DAY)
    out.push({ level: "watch", reason: `Waiting on the buyer for ${Math.floor(since(o.updated_at) / DAY)} days` });

  const open = !["delivered", "cancelled", "refunded", "pending_payment", "payment_failed"].includes(o.status);
  if (open && o.subject_removal_date) {
    const due = new Date(`${o.subject_removal_date}T23:59:59-08:00`).getTime();
    if (due - now < 2 * DAY) {
      out.push({ level: "urgent", reason: `Subject removal ${o.subject_removal_date}` });
    }
  }
  const rank = { urgent: 0, action: 1, watch: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

export async function loadDashboard() {
  const db = supabaseAdmin();
  const { data: orders, error } = await db
    .from("orders")
    .select(
      "id, created_at, updated_at, status, tier, rush, amount_cents, buyer_name, buyer_email, property_address, unit_number, subject_removal_date, paid_at, submitted_at, processing_started_at, documents_checked_at, delivered_at",
    )
    .neq("status", "pending_payment")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  const list = (orders ?? []) as DashboardOrder[];
  const ids = list.map((o) => o.id);

  const [{ data: issues }, { data: costs }] = await Promise.all([
    ids.length
      ? db.from("order_issues").select("order_id, kind, message, buyer_visible").in("order_id", ids).is("resolved_at", null)
      : Promise.resolve({ data: [] as never[] }),
    ids.length
      ? db.from("order_costs").select("order_id, category, cost_cents, currency").in("order_id", ids)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const rows = list.map((o) => {
    const orderIssues = (issues ?? []).filter((i) => i.order_id === o.id);
    const lines = (costs ?? []).filter((c) => c.order_id === o.id) as OrderCostLine[];
    const cost = costCad(lines);
    const revenue = ["refunded", "cancelled", "payment_failed"].includes(o.status) ? 0 : o.amount_cents;
    return {
      order: o,
      attention: attentionFor(o, orderIssues),
      waitingOnBuyer: orderIssues.some((i) => i.buyer_visible),
      costCents: cost,
      revenueCents: revenue,
      hasFee: lines.some((l) => l.category === "payment_fee"),
    };
  });

  const last30 = rows.filter((r) => Date.now() - new Date(r.order.created_at).getTime() < 30 * DAY && r.revenueCents > 0);
  return {
    rows,
    attention: rows.filter((r) => r.attention.length > 0),
    summary: {
      needsAttention: rows.filter((r) => r.attention.length > 0).length,
      inReview: rows.filter((r) => r.order.status === "in_review").length,
      waitingOnBuyer: rows.filter((r) => r.order.status === "awaiting_documents").length,
      inProgress: rows.filter((r) => ["paid", "processing", "approved"].includes(r.order.status)).length,
      revenue30: last30.reduce((s, r) => s + r.revenueCents, 0),
      cost30: last30.reduce((s, r) => s + r.costCents, 0),
      orders30: last30.length,
    },
    usdToCad: usdToCad(),
  };
}
