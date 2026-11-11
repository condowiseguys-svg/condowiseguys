import { DOCUMENTS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { emailHtml, escapeHtml, sendEmailOnce } from "./email";
import { logEvent, raiseIssue } from "./events";
import { checkFile } from "./file-checks";
import { sha256 } from "./hash";
import { uploadLink } from "./urls";

type DocRow = {
  id: string;
  storage_path: string;
  file_name: string;
  sha256: string | null;
  check_status: string;
  check_detail: string | null;
};

export type DocumentProblem = { documentId: string; fileName: string; detail: string };

function mimeFor(name: string) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/pdf";
}

/**
 * Fingerprints and checks every document that hasn't been checked yet.
 * Safe to re-run: a checked document keeps its result and its SHA-256 never changes.
 */
export async function checkOrderDocuments(orderId: string) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("order_documents")
    .select("id, storage_path, file_name, sha256, check_status, check_detail")
    .eq("order_id", orderId)
    .order("created_at");
  if (error) throw error;
  const docs = (data ?? []) as DocRow[];
  const problems: DocumentProblem[] = [];

  for (const doc of docs) {
    let status = doc.check_status;
    let detail = doc.check_detail;
    if (status === "pending" || !doc.sha256) {
      const { data: blob, error: dlError } = await db.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
      if (dlError || !blob) {
        status = "unreadable";
        detail = "The upload did not finish. Please upload this file again.";
        await db
          .from("order_documents")
          .update({ check_status: status, check_detail: detail, checked_at: new Date().toISOString() })
          .eq("id", doc.id);
      } else {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const result = await checkFile(bytes, blob.type || mimeFor(doc.file_name));
        status = result.status;
        detail = result.detail;
        await db
          .from("order_documents")
          .update({
            sha256: doc.sha256 ?? sha256(bytes),
            size_bytes: bytes.length,
            page_count: result.pageCount,
            check_status: result.status,
            check_detail: result.detail,
            checked_at: new Date().toISOString(),
          })
          .eq("id", doc.id);
      }
    }
    if (status !== "ok") {
      problems.push({ documentId: doc.id, fileName: doc.file_name, detail: detail ?? "This file could not be read." });
    }
  }
  return { checked: docs.length, problems };
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
