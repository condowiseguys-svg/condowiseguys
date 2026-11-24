"use server";

import { headers } from "next/headers";
import { emailConfigured, emailFrom, emailHtml, escapeHtml } from "@/lib/ops/email";
import { site } from "@/lib/site";
import { CONTACT_TOPICS } from "./topics";

export type ContactFormState = { error?: string; sent?: boolean };


const PER_IP_PER_10_MIN = 3;
const recent = new Map<string, number[]>();

/** Best effort only: each Vercel server keeps its own count. Stops a script flooding the inbox. */
async function tooManyFromVisitor() {
  const h = await headers();
  const ip = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => t > now - 10 * 60_000);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > PER_IP_PER_10_MIN;
}

function text(form: FormData, name: string, max: number) {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function sendContactMessage(_prev: ContactFormState, form: FormData): Promise<ContactFormState> {
  const fallback = "Sorry, your message didn't go through. Please try again in a few minutes.";

  // Spam trap field that people never see. Bots that fill it get a quiet "sent".
  if (text(form, "cwg_trap", 200)) {
    console.warn("contact message blocked by spam trap");
    return { sent: true };
  }

  const name = text(form, "name", 120);
  const email = text(form, "email", 200);
  const phone = text(form, "phone", 40);
  const topicRaw = text(form, "topic", 80);
  const topic = (CONTACT_TOPICS as readonly string[]).includes(topicRaw) ? topicRaw : "Something else";
  const message = text(form, "message", 5000);

  if (!name || !email || !message) return { error: "Please fill in your name, email and message." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email." };
  if (await tooManyFromVisitor())
    return { error: "You've sent a few messages already. Please wait a few minutes and try again." };
  if (!emailConfigured()) {
    console.error("contact form: RESEND_API_KEY is missing in Vercel");
    return { error: fallback };
  }

  const lines = [
    `<strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;`,
    phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}` : "",
    `<strong>Topic:</strong> ${escapeHtml(topic)}`,
    escapeHtml(message).replace(/\n/g, "<br>"),
    "Reply to this email to answer them directly.",
  ].filter(Boolean);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY || process.env.resend_api_key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: [site.email],
      reply_to: email,
      subject: `Website message: ${topic} (${name})`.replace(/[\r\n]+/g, " "),
      html: emailHtml(lines),
      text: [`From: ${name} <${email}>`, phone && `Phone: ${phone}`, `Topic: ${topic}`, "", message]
        .filter((l) => l !== "")
        .join("\n"),
    }),
  }).catch(() => null);

  if (!res?.ok) {
    const body = res ? await res.text().catch(() => "") : "network error";
    console.error("contact form send failed", res?.status, body.slice(0, 300));
    return { error: fallback };
  }
  return { sent: true };
}
