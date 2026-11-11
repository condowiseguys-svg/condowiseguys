/** Absolute site URL for links in emails and Stripe redirects. Set NEXT_PUBLIC_SITE_URL in Vercel and Trigger.dev. */
export function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export function uploadLink(orderId: string, token: string) {
  return `${siteUrl()}/order/${orderId}/upload?token=${token}`;
}

export function payLink(orderId: string, token: string) {
  return `${siteUrl()}/order/${orderId}/pay?token=${token}`;
}
