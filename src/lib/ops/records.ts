import { DOCUMENTS_BUCKET, RECORDS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { emailHtml, escapeHtml, sendEmailOnce } from "./email";
import { logEvent, raiseIssue } from "./events";
import { canonicalJson, sha256 } from "./hash";

export type ManifestEntry = {
  document_id: string;
  file_name: string;
  storage_path: string;
  sha256: string;
  size_bytes: number | null;
  page_count: number | null;
};

export type ReportVersion = {
  id: string;
  order_id: string;
  version: number;
  created_at: string;
  created_by: string;
  storage_path: string;
  sha256: string;
  size_bytes: number | null;
  source_manifest: ManifestEntry[];
  manifest_sha256: string;
  status: "draft" | "approved" | "discarded";
  approved_at: string | null;
  approved_by: string | null;
  archive_path: string | null;
};

function isDuplicate(error: { message?: string; statusCode?: string | number } | null) {
  if (!error) return false;
  return /exist|duplicate/i.test(error.message ?? "") || String(error.statusCode) === "409";
}

/** The exact set of documents a report is based on, with their fingerprints. */
export async function buildManifest(orderId: string): Promise<ManifestEntry[]> {
  const { data, error } = await supabaseAdmin()
    .from("order_documents")
    .select("id, file_name, storage_path, sha256, size_bytes, page_count, check_status")
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw error;
  const docs = data ?? [];
  if (!docs.length) throw new Error("This order has no documents.");
  const unchecked = docs.filter((d) => !d.sha256);
  if (unchecked.length) throw new Error("Some documents haven't been checked yet. Run processing first.");
  return docs
    .filter((d) => d.check_status === "ok")
    .map((d) => ({
      document_id: d.id as string,
      file_name: d.file_name as string,
      storage_path: d.storage_path as string,
      sha256: d.sha256 as string,
      size_bytes: (d.size_bytes as number | null) ?? null,
      page_count: (d.page_count as number | null) ?? null,
    }));
}

/**
 * Saves a report draft as a new numbered version. With a sourceKey (for example the
 * pipeline run id) a retry returns the version it already created instead of a new one.
 */
export async function createReportVersion(input: {
  orderId: string;
  pdf: Uint8Array;
  createdBy: string;
  sourceKey?: string;
  model?: string;
}): Promise<ReportVersion> {
  const db = supabaseAdmin();
  if (input.sourceKey) {
    const { data: existing } = await db.from("report_versions").select("*").eq("source_key", input.sourceKey).maybeSingle();
    if (existing) return existing as ReportVersion;
  }

  const manifest = await buildManifest(input.orderId);
  const hash = sha256(input.pdf);
  const path = `${input.orderId}/reports/${hash}.pdf`;
  const { error: upError } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, input.pdf, { contentType: "application/pdf", upsert: false });
  if (upError && !isDuplicate(upError)) throw upError;

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: next, error: nErr } = await db.rpc("next_report_version", { p_order_id: input.orderId });
    if (nErr) throw nErr;
    const { data, error } = await db
      .from("report_versions")
      .insert({
        order_id: input.orderId,
        version: next as number,
        created_by: input.createdBy,
        source_key: input.sourceKey ?? null,
        storage_path: path,
        sha256: hash,
        size_bytes: input.pdf.length,
        model: input.model ?? null,
        source_manifest: manifest,
        manifest_sha256: sha256(canonicalJson(manifest)),
      })
      .select("*")
      .single();
    if (!error && data) {
      await logEvent(input.orderId, input.createdBy.startsWith("pipeline") ? "system" : "admin", "report_drafted", {
        version: data.version,
        sha256: hash,
        documents: manifest.length,
      });
      return data as ReportVersion;
    }
    if (error?.code !== "23505") throw error;
    if (input.sourceKey) {
      const { data: existing } = await db.from("report_versions").select("*").eq("source_key", input.sourceKey).maybeSingle();
      if (existing) return existing as ReportVersion;
    }
    // Another draft took this version number; try the next one.
  }
  throw new Error("Could not allocate a report version number");
}

/**
 * Approves a draft and writes the permanent record: a copy of the report and of every
 * source document into the order-records bucket, plus record.json with all fingerprints.
 * Retry-safe: copies that already exist are kept, and a second approval is a no-op.
 */
export async function approveReportVersion(versionId: string, approvedBy: string): Promise<ReportVersion> {
  const db = supabaseAdmin();
  const { data: v, error } = await db.from("report_versions").select("*").eq("id", versionId).single();
  if (error || !v) throw error ?? new Error("Report version not found");
  const version = v as ReportVersion;
  if (version.status === "approved") return version;
  if (version.status !== "draft") throw new Error(`Version ${version.version} was ${version.status}`);

  const { data: order } = await db
    .from("orders")
    .select("id, status, tier, rush, property_address, unit_number, strata_plan, buyer_email")
    .eq("id", version.order_id)
    .single();
  if (!order) throw new Error("Order not found");
  if (!["processing", "in_review"].includes(order.status)) {
    throw new Error(`An order that is "${order.status}" can't have a report approved.`);
  }

  // The draft must still be exactly what was reviewed.
  const { data: draft, error: dlErr } = await db.storage.from(DOCUMENTS_BUCKET).download(version.storage_path);
  if (dlErr || !draft) throw dlErr ?? new Error("Draft file missing");
  const draftBytes = new Uint8Array(await draft.arrayBuffer());
  if (sha256(draftBytes) !== version.sha256) throw new Error("The draft file changed after it was created");

  const prefix = `${order.id}/v${version.version}-${version.id.slice(0, 8)}`;
  const records = db.storage.from(RECORDS_BUCKET);

  for (const doc of version.source_manifest) {
    const name = doc.storage_path.split("/").pop()!;
    const { error: cpErr } = await db.storage
      .from(DOCUMENTS_BUCKET)
      .copy(doc.storage_path, `${prefix}/documents/${name}`, { destinationBucket: RECORDS_BUCKET });
    if (cpErr && !isDuplicate(cpErr)) throw cpErr;
  }
  const { error: repErr } = await records.upload(`${prefix}/report.pdf`, draftBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (repErr && !isDuplicate(repErr)) throw repErr;

  // Reuse the approval time from an earlier attempt so record.json and the database agree.
  let approvedAt = new Date().toISOString();
  const { data: prior } = await records.download(`${prefix}/record.json`);
  if (prior) {
    try {
      approvedAt = (JSON.parse(await prior.text()) as { approved_at: string }).approved_at ?? approvedAt;
    } catch {
      /* keep new time */
    }
  } else {
    const record = {
      order: order,
      report: { version_id: version.id, version: version.version, sha256: version.sha256, created_at: version.created_at },
      source_documents: version.source_manifest,
      manifest_sha256: version.manifest_sha256,
      approved_by: approvedBy,
      approved_at: approvedAt,
    };
    const { error: recErr } = await records.upload(`${prefix}/record.json`, JSON.stringify(record, null, 2), {
      contentType: "application/json",
      upsert: false,
    });
    if (recErr && !isDuplicate(recErr)) throw recErr;
  }

  const { data: approved, error: apErr } = await db
    .from("report_versions")
    .update({ status: "approved", approved_at: approvedAt, approved_by: approvedBy, archive_path: prefix })
    .eq("id", version.id)
    .eq("status", "draft")
    .select("*")
    .maybeSingle();
  if (apErr) throw apErr;

  await db
    .from("orders")
    .update({ status: "approved", approved_report_id: version.id })
    .eq("id", order.id)
    .in("status", ["processing", "in_review"]);
  await logEvent(order.id, approvedBy === "auto" ? "system" : "admin", "report_approved", {
    version: version.version,
    approved_by: approvedBy,
    archive: prefix,
  });

  if (approved) return approved as ReportVersion;
  const { data: again } = await db.from("report_versions").select("*").eq("id", version.id).single();
  return again as ReportVersion;
}

/** Emails the approved report once, then marks the order delivered. Safe to retry. */
export async function deliverReport(orderId: string) {
  const db = supabaseAdmin();
  const { data: order } = await db
    .from("orders")
    .select("id, status, buyer_name, buyer_email, property_address, approved_report_id")
    .eq("id", orderId)
    .single();
  if (!order) throw new Error("Order not found");
  if (order.status === "delivered") return "already_delivered" as const;
  if (order.status !== "approved" || !order.approved_report_id) {
    throw new Error(`Order is "${order.status}", not approved`);
  }
  const { data: v } = await db.from("report_versions").select("*").eq("id", order.approved_report_id).single();
  const version = v as ReportVersion;
  const { data: file, error } = await db.storage.from(RECORDS_BUCKET).download(`${version.archive_path}/report.pdf`);
  if (error || !file) throw error ?? new Error("Archived report missing");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sha256(bytes) !== version.sha256) throw new Error("Archived report does not match its fingerprint");

  const first = order.buyer_name.split(" ")[0];
  const result = await sendEmailOnce({
    key: `report:${version.id}`,
    orderId,
    kind: "report_delivery",
    to: order.buyer_email,
    subject: `Your strata document review: ${order.property_address}`,
    reportVersionId: version.id,
    attachments: [{ filename: `Condo-Wise-Guys-Review-${order.id.slice(0, 8)}.pdf`, content: bytes }],
    html: emailHtml([
      `Hi ${escapeHtml(first)},`,
      `Your review of <strong>${escapeHtml(order.property_address)}</strong> is attached.`,
      "Reply to this email if you have any questions about what we found.",
    ]),
    text: `Hi ${first},\n\nYour review of ${order.property_address} is attached.\n\nReply to this email if you have any questions.\n`,
  });

  if (result === "not_configured") {
    await raiseIssue({
      orderId,
      kind: "delivery_failed",
      message: "Email is not set up (RESEND_API_KEY and EMAIL_FROM), so the report was not sent.",
      dedupeKey: `delivery-not-configured:${version.id}`,
    });
    return "not_configured" as const;
  }

  const { data: moved } = await db
    .from("orders")
    .update({ status: "delivered", delivered_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "approved")
    .select("id");
  if (moved?.length) await logEvent(orderId, "system", "delivered", { version: version.version, email: result });
  return result;
}
