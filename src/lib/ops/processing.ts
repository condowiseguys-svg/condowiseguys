import { supabaseAdmin } from "@/lib/supabase/admin";
import { emailHtml, escapeHtml, sendEmailOnce } from "./email";
import { logEvent, raiseIssue } from "./events";
import { checkDocument, unpackArchive, type DocRow } from "@/lib/uploads/prepare";
import { sha256 } from "./hash";
import { uploadLink } from "./urls";

export type DocumentProblem = { documentId: string; fileName: string; detail: string };

/** Statuses that need nothing from the buyer. */
const SETTLED = new Set(["ok", "duplicate", "archive"]);

async function loadDocs(orderId: string) {
  const { data, error } = await supabaseAdmin()
    .from("order_documents")
    .select("id, order_id, created_at, storage_path, file_name, size_bytes, sha256, check_status, check_detail, kind, parent_id")
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as DocRow[];
}

/**
 * Fingerprints and checks every document that hasn't been checked yet, and unpacks any ZIP
 * that hasn't been unpacked (normally both already happened while the buyer was uploading).
 * Then makes sure each distinct document is reviewed once, however many times it was uploaded.
 * Safe to re-run: a checked document keeps its result and its SHA-256 never changes.
 */
export async function checkOrderDocuments(orderId: string) {
  const db = supabaseAdmin();
  let docs = await loadDocs(orderId);
  const archives = docs.filter((d) => d.kind === "archive" && d.check_status === "pending");
  for (const a of archives) await unpackArchive(a);
  if (archives.length) docs = await loadDocs(orderId);

  for (const doc of docs) {
    if (doc.kind === "archive") continue;
    if (doc.check_status === "pending" || !doc.sha256) {
      const { status } = await checkDocument(doc);
      doc.check_status = status;
    }
  }
  docs = await loadDocs(orderId);

  // Two copies checked at the same moment can both pass as "ok": keep the first.
  const first = new Map<string, string>();
  for (const doc of docs) {
    if (doc.check_status !== "ok" || !doc.sha256) continue;
    const original = first.get(doc.sha256);
    if (!original) {
      first.set(doc.sha256, doc.id);
      continue;
    }
    const detail = `Same as ${docs.find((d) => d.id === original)?.file_name ?? "another file"}; it will be reviewed once.`;
    await db.from("order_documents").update({ check_status: "duplicate", duplicate_of: original, check_detail: detail }).eq("id", doc.id);
    doc.check_status = "duplicate";
  }

  const problems: DocumentProblem[] = docs
    .filter((d) => !SETTLED.has(d.check_status))
    .map((d) => ({ documentId: d.id, fileName: d.file_name, detail: d.check_detail ?? "This file could not be read." }));
  const reviewed = docs.filter((d) => d.kind !== "archive" && d.check_status === "ok").length;
  return { checked: reviewed, problems };
}

type OrderForEmail = { id: string; upload_token: string; buyer_name: string; buyer_email: string; property_address: string };

async function loadOrder(orderId: string): Promise<OrderForEmail> {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("id, upload_token, buyer_name, buyer_email, property_address")
    .eq("id", orderId)
    .single();
  if (error || !data) throw error ?? new Error("order not found");
  return data as OrderForEmail;
}

/**
 * Moves the order to "awaiting documents" and emails the buyer once.
 * `fromStatuses` guards against racing another change (e.g. Brian acting at the same time).
 */
async function askBuyer(
  orderId: string,
  emailKey: string,
  fromStatuses: string[],
  lines: string[],
  submission?: number,
) {
  const db = supabaseAdmin();
  let q = db.from("orders").update({ status: "awaiting_documents" }).eq("id", orderId).in("status", fromStatuses);
  if (submission !== undefined) q = q.eq("submission_count", submission);
  const { data: moved, error } = await q.select("id");
  if (error) throw error;
  if (!moved?.length) return false;

  const order = await loadOrder(orderId);
  const first = order.buyer_name.split(" ")[0];
  const list = lines.map((l) => `• ${escapeHtml(l)}`).join("<br>");
  await sendEmailOnce({
    key: emailKey,
    orderId,
    kind: "documents_needed",
    to: order.buyer_email,
    subject: `We need a few more documents for ${order.property_address}`,
    html: emailHtml(
      [
        `Hi ${escapeHtml(first)},`,
        `We started your review of <strong>${escapeHtml(order.property_address)}</strong> and need the following before we can finish:`,
        list,
        "Use the button below to add files, then press Submit again. Your turnaround starts once we have everything.",
      ],
      { href: uploadLink(order.id, order.upload_token), label: "Add documents" },
    ),
    text: `Hi ${first},\n\nWe need the following before we can finish your review of ${order.property_address}:\n${lines
      .map((l) => `- ${l}`)
      .join("\n")}\n\nAdd files here: ${uploadLink(order.id, order.upload_token)}\n`,
  });
  await logEvent(orderId, "system", "awaiting_documents", { lines });
  return true;
}

/** Unreadable files found during processing: ask the buyer for replacements. */
export async function requestReplacements(orderId: string, submission: number, problems: DocumentProblem[]) {
  for (const p of problems) {
    await raiseIssue({
      orderId,
      kind: "unreadable_file",
      message: `${p.fileName}: ${p.detail}`,
      dedupeKey: `unreadable:${p.documentId}`,
      buyerVisible: true,
      documentId: p.documentId,
    });
  }
  return askBuyer(
    orderId,
    `documents-needed:${orderId}:unreadable:${submission}`,
    ["processing"],
    problems.map((p) => `A readable copy of ${p.fileName} (${p.detail.replace(/\.$/, "")})`),
    submission,
  );
}

/** Brian (or the analysis step) found the package incomplete. */
export async function requestMissingDocuments(orderId: string, items: string[], note: string, by: "admin" | "system") {
  const lines = [...items, ...(note ? [note] : [])];
  if (!lines.length) throw new Error("Nothing to request");
  const key = sha256(lines.join("|")).slice(0, 16);
  await raiseIssue({
    orderId,
    kind: "incomplete_package",
    message: `Missing: ${lines.join("; ")}`,
    dedupeKey: `incomplete:${orderId}:${key}`,
    buyerVisible: true,
  });
  const moved = await askBuyer(orderId, `documents-needed:${orderId}:missing:${key}`, ["processing", "in_review"], lines);
  await logEvent(orderId, by, "missing_documents_requested", { items, note, moved });
  return moved;
}

/**
 * The document-check step of processing one submission. Used by the Trigger.dev task and,
 * when Trigger.dev isn't set up, run directly on the web server after the response is sent.
 * Only the run that claims the order does any work; a second run for the same submission exits.
 */
export async function runDocumentChecks(orderId: string, submission: number, runId: string, firstAttempt = true) {
  const db = supabaseAdmin();
  const { data: claimed, error } = await db.rpc("claim_order_processing", {
    p_order_id: orderId,
    p_run_id: runId,
    p_submission: submission,
  });
  if (error) throw error;
  if (!claimed) return { skipped: true as const };
  if (firstAttempt) await logEvent(orderId, "system", "processing_started", { run: runId });

  const { checked, problems } = await checkOrderDocuments(orderId);
  if (problems.length) {
    await requestReplacements(orderId, submission, problems);
    return { status: "awaiting_documents" as const, problems: problems.length };
  }

  await db
    .from("orders")
    .update({ documents_checked_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("processing_run_id", runId);
  await logEvent(orderId, "system", "documents_checked", { documents: checked });
  await confirmDocumentsReceived(orderId, submission);
  return { status: "ready_for_analysis" as const, documents: checked };
}

/**
 * Tells the buyer every file was received and checked, and the review is under way. Never
 * throws: the review carries on even if this email fails.
 */
async function confirmDocumentsReceived(orderId: string, submission: number) {
  try {
    const { data } = await supabaseAdmin()
      .from("order_documents")
      .select("check_status, page_count, kind")
      .eq("order_id", orderId);
    const docs = (data ?? []).filter((d) => d.kind !== "archive");
    const ok = docs.filter((d) => d.check_status === "ok");
    const pages = ok.reduce((n, d) => n + ((d.page_count as number | null) ?? 0), 0);
    const dupes = docs.filter((d) => d.check_status === "duplicate").length;
    const order = await loadOrder(orderId);
    const first = order.buyer_name.split(" ")[0];
    const counts = `${ok.length} document${ok.length === 1 ? "" : "s"}${pages ? ` (${pages.toLocaleString()} pages)` : ""}`;
    const dupeLine = dupes ? ` ${dupes} duplicate cop${dupes === 1 ? "y was" : "ies were"} set aside so nothing is reviewed twice.` : "";
    await sendEmailOnce({
      key: `documents-received:${orderId}:${submission}`,
      orderId,
      kind: "documents_received",
      to: order.buyer_email,
      subject: `Documents received: ${order.property_address}`,
      html: emailHtml([
        `Hi ${escapeHtml(first)},`,
        `We've received and checked ${escapeHtml(counts)} for <strong>${escapeHtml(order.property_address)}</strong>.${escapeHtml(dupeLine)}`,
        "Your review is under way. We'll email your report as soon as it's ready, or let you know if we need anything else.",
      ]),
      text: `Hi ${first},\n\nWe've received and checked ${counts} for ${order.property_address}.${dupeLine}\n\nYour review is under way. We'll email your report as soon as it's ready, or let you know if we need anything else.\n`,
    });
  } catch (err) {
    console.error("documents-received email failed", orderId, err);
  }
}
