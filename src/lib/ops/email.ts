import { supabaseAdmin } from "@/lib/supabase/admin";
import { logEvent } from "./events";

export type EmailResult = "sent" | "already_sent" | "not_configured";

/** Vercel keeps names exactly as typed, so accept the lowercase name the key was first saved under. */
function resendKey() {
  return process.env.RESEND_API_KEY || process.env.resend_api_key;
}

export function emailConfigured() {
  return Boolean(resendKey() && process.env.EMAIL_FROM);
}

/**
 * Sends an email at most once per key.
 * - A row in outbound_emails is created first; if it is already marked sent, nothing is sent.
 * - The same key goes to Resend as its Idempotency-Key, so a crash between "Resend accepted it"
 *   and "we saved that" still can't produce a second email when the job retries.
 * Throws on a failed send so the calling job retries.
 */
export async function sendEmailOnce(msg: {
  key: string;
  orderId: string | null;
  kind: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  reportVersionId?: string;
  attachments?: { filename: string; content: Buffer }[];
}): Promise<EmailResult> {
  const db = supabaseAdmin();
  await db.from("outbound_emails").upsert(
    {
      idempotency_key: msg.key,
      order_id: msg.orderId,
      kind: msg.kind,
      to_email: msg.to,
      subject: msg.subject,
      report_version_id: msg.reportVersionId ?? null,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  const { data: row, error } = await db
    .from("outbound_emails")
    .select("id, status, attempts")
    .eq("idempotency_key", msg.key)
    .single();
  if (error || !row) throw error ?? new Error("outbound_emails row missing");
  if (row.status === "sent") return "already_sent";

  if (!emailConfigured()) {
    await db.from("outbound_emails").update({ last_error: "Email is not configured" }).eq("id", row.id);
    return "not_configured";
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendKey()}`,
      "content-type": "application/json",
      "idempotency-key": msg.key.slice(0, 256),
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [msg.to],
      reply_to: process.env.EMAIL_REPLY_TO || undefined,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };

  if (!res.ok) {
    await db
      .from("outbound_emails")
      .update({ status: "failed", attempts: row.attempts + 1, last_error: body.message ?? `HTTP ${res.status}` })
      .eq("id", row.id);
    throw new Error(`Email send failed: ${body.message ?? res.status}`);
  }

  await db
    .from("outbound_emails")
    .update({ status: "sent", provider_id: body.id ?? null, sent_at: new Date().toISOString(), attempts: row.attempts + 1 })
    .eq("id", row.id);
  if (msg.orderId) await logEvent(msg.orderId, "system", "email_sent", { kind: msg.kind, to: msg.to });
  return "sent";
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Simple branded wrapper for transactional emails. */
export function emailHtml(paragraphs: string[], link?: { href: string; label: string }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${p}</p>`).join("");
  const button = link
    ? `<p style="margin:24px 0"><a href="${link.href}" style="background:#1e5bd8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(link.label)}</a></p>`
    : "";
  return `<div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px">
<p style="font-weight:700;color:#05153a;font-size:18px;margin:0 0 24px">Condo Wise Guys</p>${body}${button}
<p style="color:#64748b;font-size:13px;margin-top:32px">Our reports are document reviews, not legal advice, a home inspection or an appraisal.</p></div>`;
}
