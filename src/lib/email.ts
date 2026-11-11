import "server-only";

/** Sends a plain notice through Resend. Quietly does nothing if RESEND_API_KEY is not set. */
export async function sendEmail(to: string | string[], subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!key || !from || recipients.length === 0) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: recipients, subject, text }),
    });
    if (!res.ok) console.error("Email notice failed", res.status, await res.text());
  } catch (err) {
    console.error("Email notice failed", err);
  }
}
