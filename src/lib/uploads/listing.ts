import type { DocType } from "@/lib/analysis/checklist";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { categoryLabel, packageSummary, type ArchiveSummary } from "./prepare";

/** One row on the buyer's upload page. Plain data, safe to send to the browser. */
export type UploadListItem = {
  id: string;
  path: string;
  name: string;
  size: number;
  kind: "document" | "archive";
  state: "checking" | "ready" | "duplicate" | "problem" | "unpacking" | "unpacked";
  detail: string | null;
  category: string | null;
  pages: number | null;
  /** Part of a submission we already received: can't be removed. */
  locked: boolean;
  /** For a problem file found inside a ZIP: the ZIP's name. */
  insideOf?: string;
  archive?: {
    seen?: number;
    total?: number;
    documents: number;
    pages: number;
    unreadable: number;
    duplicates: { path: string; sameAs: string }[];
    skipped: { path: string; reason: string }[];
    categories: { label: string; count: number }[];
  };
};

export type UploadListing = {
  items: UploadListItem[];
  documents: number;
  pages: number;
  busy: number;
  possiblyMissing: string[];
};

type Row = {
  id: string;
  created_at: string;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  page_count: number | null;
  check_status: string;
  check_detail: string | null;
  category: string | null;
  kind: "document" | "archive" | null;
  parent_id: string | null;
  unpack_detail: ArchiveSummary | null;
};

function stateOf(r: Row): UploadListItem["state"] {
  if (r.kind === "archive") return r.check_status === "pending" ? "unpacking" : r.check_status === "archive" ? "unpacked" : "problem";
  if (r.check_status === "pending") return "checking";
  if (r.check_status === "ok") return "ready";
  if (r.check_status === "duplicate") return "duplicate";
  return "problem";
}

/** Everything the buyer has uploaded to this order, as the upload page shows it. */
export async function loadUploadListing(order: { id: string; submitted_at?: string | null }): Promise<UploadListing> {
  const { data, error } = await supabaseAdmin()
    .from("order_documents")
    .select("id, created_at, storage_path, file_name, size_bytes, page_count, check_status, check_detail, category, kind, parent_id, unpack_detail")
    .eq("order_id", order.id)
    .order("created_at");
  if (error) throw error;
  const rows = (data ?? []) as Row[];
  const submittedAt = order.submitted_at ? new Date(order.submitted_at).getTime() : 0;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const locked = (r: Row) => {
    const top = r.parent_id ? byId.get(r.parent_id) ?? r : r;
    return submittedAt > 0 && new Date(top.created_at).getTime() <= submittedAt && top.check_status !== "unreadable";
  };

  const items: UploadListItem[] = [];
  for (const r of rows) {
    const state = stateOf(r);
    // Documents unpacked from a ZIP are summarized on the ZIP's row; only problems are listed.
    if (r.parent_id && state !== "problem") continue;
    const u = r.unpack_detail;
    items.push({
      id: r.id,
      path: r.storage_path,
      name: r.file_name,
      size: Number(r.size_bytes ?? 0),
      kind: r.kind ?? "document",
      state,
      detail: r.check_detail,
      category: r.kind === "archive" || state !== "ready" ? null : categoryLabel(r.category),
      pages: r.page_count,
      locked: locked(r),
      insideOf: r.parent_id ? byId.get(r.parent_id)?.file_name : undefined,
      archive:
        r.kind === "archive"
          ? {
              seen: u?.seen,
              total: u?.total,
              documents: u?.documents ?? 0,
              pages: u?.pages ?? 0,
              unreadable: u?.unreadable ?? 0,
              duplicates: u?.duplicates ?? [],
              skipped: u?.skipped ?? [],
              categories: Object.entries(u?.categories ?? {})
                .map(([type, count]) => ({ label: categoryLabel(type as DocType), count: count as number }))
                .sort((a, b) => b.count - a.count),
            }
          : undefined,
    });
  }
  const summary = await packageSummary(order.id);
  return {
    items,
    documents: summary.documents,
    pages: summary.pages,
    busy: items.filter((i) => i.state === "checking" || i.state === "unpacking").length,
    possiblyMissing: summary.possiblyMissing,
  };
}
