export const QUICK_SCAN = {
  id: "quick_scan",
  name: "Quick Scan",
  tagline: "A plain-language review of a strata document package.",
  description:
    "Upload the strata package for a unit you are considering. We review the key documents and send back a written report on what stands out.",
  priceCents: Number(process.env.QUICK_SCAN_PRICE_CENTS ?? 14900),
  currency: (process.env.QUICK_SCAN_CURRENCY ?? "cad").toLowerCase(),
} as const;

export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [
  "pdf",
  "zip",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "jpg",
  "jpeg",
  "png",
];

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails().includes(email.toLowerCase());
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Vancouver",
  }).format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/orders"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
