import "server-only";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Limits on new orders, so a script can't fill the database with junk orders or open
 * thousands of Stripe checkout pages. Checked against the orders table, so the limits hold
 * across every Vercel server, plus a quick per-visitor check in memory as a first line.
 */
const PER_EMAIL_PER_HOUR = 5;
const UNPAID_SITEWIDE_PER_10_MIN = 40;
const PER_IP_PER_10_MIN = 10;

const recent = new Map<string, number[]>();

async function visitorIp() {
  const h = await headers();
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Best effort only: each Vercel server keeps its own count. */
function tooManyFromIp(ip: string) {
  const now = Date.now();
  const windowStart = now - 10 * 60_000;
  const hits = (recent.get(ip) ?? []).filter((t) => t > windowStart);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) recent.clear();
  return hits.length > PER_IP_PER_10_MIN;
}

/** Returns a message for the buyer when they should wait, or null when the order can go ahead. */
export async function orderRateLimit(buyerEmail: string): Promise<string | null> {
  const busy = "We're getting a lot of orders right now. Please wait a few minutes and try again, or email us.";
  if (tooManyFromIp(await visitorIp())) return busy;

  const db = supabaseAdmin();
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const [byEmail, unpaid] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).ilike("buyer_email", buyerEmail.replace(/[%_\\]/g, "\\$&")).gte("created_at", hourAgo),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_payment").gte("created_at", tenMinAgo),
  ]);
  // If the check itself fails, let the order through rather than turn a real buyer away.
  if ((byEmail.count ?? 0) >= PER_EMAIL_PER_HOUR) return busy;
  if ((unpaid.count ?? 0) >= UNPAID_SITEWIDE_PER_10_MIN) return busy;
  return null;
}
