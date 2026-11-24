import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { DOC_TYPE_LABEL, SATISFIES, type DocType } from "@/lib/analysis/checklist";
import { emailHtml, escapeHtml, sendEmailOnce } from "@/lib/ops/email";
import { logEvent } from "@/lib/ops/events";
import { missingRequired } from "@/lib/ops/package-checklist";
import { uploadLink } from "@/lib/ops/urls";
import { DOCUMENTS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { categoryRank } from "./categorize";
import { inspectDocument } from "./inspect";
import { CONTENT_TYPES, MAX_FILE_BYTES, uploadKind } from "./limits";
import { HandlerError, unpackZip, type Skipped } from "./unzip";

/**
 * Runs as soon as a file finishes uploading (a background job when Trigger.dev is set up):
 *  - a PDF or photo is checked, fingerprinted, labelled and compared with the rest of the
 *    order so the same document uploaded twice is only reviewed once;
 *  - a ZIP is unpacked safely and each document inside becomes its own record, so buyers
 *    never have to extract or reorganize anything themselves.
 * The buyer sees the results on the upload page before pressing Submit. Safe to re-run.
 */

export type DocRow = {
  id: string;
  order_id: string;
  created_at: string;
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  sha256: string | null;
  check_status: string;
  check_detail: string | null;
  kind: "document" | "archive";
  parent_id: string | null;
};

export type ArchiveSummary = {
  stage: "unpacking" | "done";
  seen?: number;
  total?: number;
  documents?: number;
  pages?: number;
  unreadable?: number;
  duplicates?: { path: string; sameAs: string }[];
  skipped?: Skipped[];
  categories?: Partial<Record<DocType, number>>;
};

const DOC_COLUMNS = "id, order_id, created_at, storage_path, file_name, size_bytes, sha256, check_status, check_detail, kind, parent_id";

export function safeName(name: string) {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_");
  return cleaned.slice(-120) || "document.pdf";
}

async function loadDoc(documentId: string) {
  const { data, error } = await supabaseAdmin().from("order_documents").select(DOC_COLUMNS).eq("id", documentId).maybeSingle();
  if (error) throw error;
  return data as DocRow | null;
}

/** Readable documents already in the order, by fingerprint, for spotting duplicates. */
async function knownFingerprints(orderId: string, exceptParent?: string) {
  const { data, error } = await supabaseAdmin()
    .from("order_documents")
    .select("id, file_name, sha256, parent_id, created_at")
    .eq("order_id", orderId)
    .eq("check_status", "ok")
    .not("sha256", "is", null)
    .order("created_at");
  if (error) throw error;
  const map = new Map<string, { id: string; name: string }>();
  for (const d of data ?? []) {
    if (exceptParent && d.parent_id === exceptParent) continue;
    if (!map.has(d.sha256 as string)) map.set(d.sha256 as string, { id: d.id as string, name: d.file_name as string });
  }
  return map;
}

export async function prepareUpload(documentId: string) {
  const doc = await loadDoc(documentId);
  if (!doc) return { status: "gone" as const };
  return doc.kind === "archive" ? unpackArchive(doc) : checkDocument(doc);
}

/** Checks one uploaded PDF or photo. Returns its final status. */
export async function checkDocument(doc: DocRow) {
  if (doc.check_status !== "pending" && doc.sha256) return { status: doc.check_status };
  const db = supabaseAdmin();
  const kind = uploadKind(doc.file_name);
  const { data: blob, error } = await db.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
  if (error || !blob || !kind || kind === "zip") {
    const detail = !kind || kind === "zip" ? "This file type can't be reviewed." : "The upload did not finish. Please upload this file again.";
    await db
      .from("order_documents")
      .update({ check_status: "unreadable", check_detail: detail, checked_at: new Date().toISOString() })
      .eq("id", doc.id);
    return { status: "unreadable" };
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const result = await inspectDocument(bytes, doc.file_name, kind);
  let status: string = result.status;
  let duplicateOf: string | null = null;
  let detail = result.detail;
  if (status === "ok") {
    const known = await knownFingerprints(doc.order_id);
    const same = known.get(result.sha256);
    if (same && same.id !== doc.id) {
      status = "duplicate";
      duplicateOf = same.id;
      detail = `Same as ${same.name}; it will be reviewed once.`;
    }
  }
  const { error: upError } = await db
    .from("order_documents")
    .update({
      sha256: doc.sha256 ?? result.sha256,
      size_bytes: bytes.length,
      page_count: result.pageCount,
      check_status: status,
      check_detail: detail,
      category: result.category,
      duplicate_of: duplicateOf,
      checked_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (upError) throw upError;
  return { status };
}

/** Streams a stored file to a temp file and returns its path and SHA-256. */
async function downloadToTemp(path: string) {
  const db = supabaseAdmin();
  const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw error ?? new Error("Could not sign the download");
  const res = await fetch(data.signedUrl);
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const file = join(tmpdir(), `cwg-${randomUUID()}.zip`);
  const hash = createHash("sha256");
  let size = 0;
  await pipeline(
    Readable.fromWeb(res.body as unknown as WebReadableStream<Uint8Array>),
    new Transform({
      transform(chunk: Buffer, _e, done) {
        size += chunk.length;
        if (size > MAX_FILE_BYTES) return done(new Error("The ZIP is larger than 1 GB"));
        hash.update(chunk);
        done(null, chunk);
      },
    }),
    createWriteStream(file),
  );
  return { file, sha256: hash.digest("hex"), size };
}

type Child = {
  id: string;
  duplicateOf: string | null;
  path: string;
  storage_path: string;
  size: number;
  sha256: string;
  status: string;
  detail: string | null;
  pages: number | null;
  category: string;
};

/** The same id for the same entry every time, so a retried unpack can't create a second copy. */
function childId(archiveId: string, index: number) {
  const h = createHash("sha256").update(`${archiveId}:${index}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Unpacks a ZIP into separate documents. Returns its final status. */
export async function unpackArchive(archive: DocRow) {
  if (archive.check_status !== "pending") return { status: archive.check_status };
  const db = supabaseAdmin();
  const setSummary = (summary: ArchiveSummary) =>
    db.from("order_documents").update({ unpack_detail: summary }).eq("id", archive.id);
  await setSummary({ stage: "unpacking", seen: 0 });

  const { file, sha256, size } = await downloadToTemp(archive.storage_path);
  const known = await knownFingerprints(archive.order_id, archive.id);
  const children: Child[] = [];
  const duplicates: { path: string; sameAs: string }[] = [];
  let skipped: Skipped[] = [];
  let index = 0;

  try {
    const result = await unpackZip(
      file,
      async ({ path, kind, bytes }) => {
        const inspected = await inspectDocument(bytes, path, kind);
        const id = childId(archive.id, ++index);
        const same = inspected.status === "ok" ? known.get(inspected.sha256) : undefined;
        if (same) duplicates.push({ path, sameAs: same.name });
        else if (inspected.status === "ok") known.set(inspected.sha256, { id, name: path });
        const base = path.split("/").pop() ?? "document";
        const storagePath = `${archive.order_id}/unpacked/${archive.id}/${String(index).padStart(4, "0")}-${safeName(base)}`;
        const { error } = await db.storage
          .from(DOCUMENTS_BUCKET)
          .upload(storagePath, bytes, { contentType: CONTENT_TYPES[kind], upsert: true });
        if (error) throw error;
        children.push({
          id,
          path,
          storage_path: storagePath,
          size: bytes.length,
          sha256: inspected.sha256,
          // A duplicate is kept (so removing the other copy later doesn't lose it) but not reviewed twice.
          status: same ? "duplicate" : inspected.status,
          detail: same ? `Same as ${same.name}; it will be reviewed once.` : inspected.detail,
          duplicateOf: same?.id ?? null,
          pages: inspected.pageCount,
          category: inspected.category,
        });
      },
      { onProgress: async (seen, total) => void (await setSummary({ stage: "unpacking", seen, total })) },
    );
    skipped = result.skipped;
  } catch (err) {
    if (err instanceof HandlerError) throw err.inner; // storage hiccup: let the job retry
    const reason = err instanceof Error ? err.message : String(err);
    await db
      .from("order_documents")
      .update({
        sha256: archive.sha256 ?? sha256,
        size_bytes: size,
        check_status: "unreadable",
        check_detail: `This ZIP could not be unpacked safely (${reason.slice(0, 160)}). Please check the file and upload it again, or upload the PDFs on their own.`,
        unpack_detail: { stage: "done", documents: 0 } satisfies ArchiveSummary,
        checked_at: new Date().toISOString(),
      })
      .eq("id", archive.id);
    await logEvent(archive.order_id, "system", "archive_rejected", { document: archive.id, reason: reason.slice(0, 300) });
    return { status: "unreadable" };
  } finally {
    await rm(file, { force: true });
  }

  // Store the documents in reading order (Form B first, minutes by date...), right where the
  // ZIP sits in the order, so the report's page numbers follow a sensible package.
  children.sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.path.localeCompare(b.path, "en", { numeric: true }));
  const start = new Date(archive.created_at).getTime();
  const rows = children.map((c, i) => ({
    id: c.id,
    order_id: archive.order_id,
    created_at: new Date(start + i + 1).toISOString(),
    storage_path: c.storage_path,
    file_name: c.path.slice(-200),
    size_bytes: c.size,
    sha256: c.sha256,
    page_count: c.pages,
    check_status: c.status,
    check_detail: c.detail,
    category: c.category,
    kind: "document",
    parent_id: archive.id,
    checked_at: new Date().toISOString(),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("order_documents").upsert(rows.slice(i, i + 200), { onConflict: "storage_path", ignoreDuplicates: true });
    if (error) throw error;
  }
  // Linked after every row exists, since a copy can point at a document stored after it.
  for (const c of children.filter((c) => c.duplicateOf)) {
    const { error } = await db.from("order_documents").update({ duplicate_of: c.duplicateOf }).eq("id", c.id);
    if (error) throw error;
  }

  const categories: Partial<Record<DocType, number>> = {};
  for (const c of children) if (c.status === "ok") categories[c.category as DocType] = (categories[c.category as DocType] ?? 0) + 1;
  const summary: ArchiveSummary = {
    stage: "done",
    documents: children.filter((c) => c.status === "ok").length,
    pages: children.reduce((n, c) => n + (c.status === "ok" ? (c.pages ?? 0) : 0), 0),
    unreadable: children.filter((c) => c.status !== "ok").length,
    duplicates: duplicates.slice(0, 500),
    skipped: skipped.slice(0, 500),
    categories,
  };
  const { error } = await db
    .from("order_documents")
    .update({
      sha256: archive.sha256 ?? sha256,
      size_bytes: size,
      check_status: "archive",
      check_detail: null,
      unpack_detail: summary,
      checked_at: new Date().toISOString(),
    })
    .eq("id", archive.id);
  if (error) throw error;
  await logEvent(archive.order_id, "system", "archive_unpacked", {
    document: archive.id,
    documents: summary.documents,
    pages: summary.pages,
    duplicates: duplicates.length,
    skipped: skipped.length,
    unreadable: summary.unreadable,
  });
  try {
    await tellBuyerIfAllUnpacked(archive.order_id, archive.id);
  } catch (err) {
    // The documents are saved; a failed email must not undo that or retry the unpacking.
    console.error("uploads-ready email failed", archive.id, err);
  }
  return { status: "archive" };
}

/** Marks a ZIP we gave up on (after the job's retries) so the buyer can try again. */
export async function markArchiveFailed(documentId: string, reason: string) {
  await supabaseAdmin()
    .from("order_documents")
    .update({
      check_status: "unreadable",
      check_detail: "We couldn't finish unpacking this ZIP. Please remove it and upload it again, or email us.",
      unpack_detail: { stage: "done", documents: 0 } satisfies ArchiveSummary,
      checked_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("kind", "archive")
    .eq("check_status", "pending");
  // A PDF or photo just stays "pending" and is checked again when the buyer submits.
  console.error("prepare failed", documentId, reason);
}

/** What has been found so far across the whole order, for the page and the emails. */
export async function packageSummary(orderId: string) {
  const { data, error } = await supabaseAdmin()
    .from("order_documents")
    .select("category, check_status, page_count, kind")
    .eq("order_id", orderId);
  if (error) throw error;
  const ok = (data ?? []).filter((d) => d.kind !== "archive" && d.check_status === "ok");
  const found = new Set(ok.map((d) => SATISFIES[d.category as DocType]).filter(Boolean) as string[]);
  return {
    documents: ok.length,
    pages: ok.reduce((n, d) => n + ((d.page_count as number | null) ?? 0), 0),
    pendingArchives: (data ?? []).filter((d) => d.kind === "archive" && d.check_status === "pending").length,
    // Only a hint: a file name or first page may not show what's inside. The report pipeline decides.
    possiblyMissing: missingRequired(found).map((m) => m.label),
  };
}

/** Once the last ZIP in the order is unpacked, email the buyer (they may have left the page). */
async function tellBuyerIfAllUnpacked(orderId: string, archiveId: string) {
  const db = supabaseAdmin();
  const { data: order } = await db
    .from("orders")
    .select("id, status, upload_token, buyer_name, buyer_email, property_address")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || !["paid", "awaiting_documents"].includes(order.status as string)) return;
  const summary = await packageSummary(orderId);
  if (summary.pendingArchives) return;
  const first = (order.buyer_name as string).split(" ")[0];
  const link = uploadLink(order.id as string, order.upload_token as string);
  const counts = `${summary.documents} document${summary.documents === 1 ? "" : "s"} (${summary.pages.toLocaleString()} pages)`;
  const hint = summary.possiblyMissing.length
    ? `We couldn't spot these yet. If they're in your package you don't need to do anything; if not, please add them: ${summary.possiblyMissing.join("; ")}.`
    : "";
  await sendEmailOnce({
    key: `uploads-ready:${archiveId}`,
    orderId,
    kind: "uploads_ready",
    to: order.buyer_email as string,
    subject: `Your documents are unpacked: ${order.property_address}`,
    html: emailHtml(
      [
        `Hi ${escapeHtml(first)},`,
        `Your files for <strong>${escapeHtml(order.property_address as string)}</strong> are unpacked and checked: ${escapeHtml(counts)} ready for review.`,
        ...(hint ? [escapeHtml(hint)] : []),
        "<strong>One last step:</strong> open your upload page and press Submit to start your review.",
      ],
      { href: link, label: "Review and submit" },
    ),
    text: `Hi ${first},\n\nYour files for ${order.property_address} are unpacked and checked: ${counts} ready for review.\n${hint ? `\n${hint}\n` : ""}\nOne last step: open your upload page and press Submit to start your review: ${link}\n`,
  });
}

export function categoryLabel(type: string | null | undefined) {
  return DOC_TYPE_LABEL[(type ?? "other") as DocType] ?? "Other";
}
