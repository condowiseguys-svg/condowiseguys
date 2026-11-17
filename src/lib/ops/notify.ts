import { site } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emailHtml, escapeHtml, sendEmailOnce } from "./email";
import { siteUrl } from "./urls";

/** Where Brian's notifications go: ADMIN_EMAIL if set, otherwise the business inbox. */
export function adminEmail() {
  return process.env.ADMIN_EMAIL?.trim() || site.email;
}

/**
 * Emails Brian about an order, at most once per key. Never throws: a notification
 * must not break payment, processing or delivery.
 */
export async function notifyAdmin(n: { key: string; orderId: string; subject: string; lines: string[] }) {
  try {
    const { data: order } = await supabaseAdmin()
      .from("orders")
      .select("property_address, tier, buyer_name, buyer_email, amount_cents")
      .eq("id", n.orderId)
      .maybeSingle();
    const link = `${siteUrl()}/admin/orders/${n.orderId}`;
    const about = order
      ? `${order.property_address} · ${order.tier === "expert" ? "Expert Reviewed" : "Standard"} · ${order.buyer_name} (${order.buyer_email})`
      : `Order ${n.orderId.slice(0, 8)}`;
    await sendEmailOnce({
      key: `admin:${n.key}`,
      orderId: n.orderId,
      kind: "admin_notice",
      to: adminEmail(),
      subject: `${n.subject}${order ? `: ${order.property_address}` : ""}`,
      html: emailHtml([escapeHtml(about), ...n.lines], { href: link, label: "Open the order" }),
      text: `${about}\n${n.lines.map((l) => l.replace(/<[^>]+>/g, "")).join("\n")}\n${link}\n`,
    });
  } catch (err) {
    console.error("admin notification failed", n.key, err);
  }
}
