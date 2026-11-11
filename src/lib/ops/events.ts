import { supabaseAdmin } from "@/lib/supabase/admin";

export type Actor = "system" | "buyer" | "admin" | "stripe";

export type IssueKind =
  | "payment_failed"
  | "unreadable_file"
  | "incomplete_package"
  | "processing_failed"
  | "delivery_failed"
  | "dispute"
  | "other";

/** Appends to the order's permanent event log. Never throws: logging must not break the flow. */
export async function logEvent(orderId: string, actor: Actor, kind: string, detail: Record<string, unknown> = {}) {
  const { error } = await supabaseAdmin().from("order_events").insert({ order_id: orderId, actor, kind, detail });
  if (error) console.error("order_events insert failed", kind, error);
}

/**
 * Records a problem once. The dedupe key makes this safe to call from a retried job:
 * the same problem never shows up twice.
 */
export async function raiseIssue(issue: {
  orderId: string;
  kind: IssueKind;
  message: string;
  dedupeKey: string;
  buyerVisible?: boolean;
  documentId?: string | null;
}) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("order_issues")
    .upsert(
      {
        order_id: issue.orderId,
        kind: issue.kind,
        message: issue.message,
        dedupe_key: issue.dedupeKey,
        buyer_visible: issue.buyerVisible ?? false,
        document_id: issue.documentId ?? null,
      },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  if (data && data.length > 0) {
    await logEvent(issue.orderId, "system", "issue_raised", { kind: issue.kind, message: issue.message });
  }
}

export async function resolveIssues(
  filter: { orderId: string; buyerVisibleOnly?: boolean; id?: string; documentId?: string; kind?: IssueKind },
  by: string,
  resolution: string,
) {
  let q = supabaseAdmin()
    .from("order_issues")
    .update({ resolved_at: new Date().toISOString(), resolved_by: by, resolution })
    .eq("order_id", filter.orderId)
    .is("resolved_at", null);
  if (filter.buyerVisibleOnly) q = q.eq("buyer_visible", true);
  if (filter.id) q = q.eq("id", filter.id);
  if (filter.documentId) q = q.eq("document_id", filter.documentId);
  if (filter.kind) q = q.eq("kind", filter.kind);
  const { error } = await q;
  if (error) throw error;
}
