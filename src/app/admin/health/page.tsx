import { supabaseAdmin, supabaseOrigin, DOCUMENTS_BUCKET, RECORDS_BUCKET } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const TABLES = [
  "orders", "order_documents", "report_versions", "order_events",
  "order_issues", "outbound_emails", "stripe_events", "order_costs",
];

/** Which kind of Supabase key is set, without showing the key. */
function keyKind(key: string | undefined) {
  const k = key?.trim();
  if (!k) return { label: "missing", ok: false };
  if (k.startsWith("sb_secret_")) return { label: "secret key (correct)", ok: true };
  if (k.startsWith("sb_publishable_")) return { label: "publishable key (wrong one: use the secret key)", ok: false };
  const parts = k.split(".");
  if (parts.length === 3) {
    try {
      const role = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role;
      if (role === "service_role") return { label: "service_role key (correct)", ok: true };
      return { label: `${role} key (wrong one: use service_role)`, ok: false };
    } catch {
      /* fall through */
    }
  }
  return { label: "not recognised as a Supabase key", ok: false };
}

type Check = { name: string; ok: boolean; detail: string };

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const raw = process.env.SUPABASE_URL;
  const origin = supabaseOrigin(raw);
  checks.push({
    name: "Supabase address",
    ok: !!origin && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(origin),
    detail: origin ? `${origin}${raw?.trim() !== origin ? " (extra text after .supabase.co was ignored)" : ""}` : "missing",
  });
  const kind = keyKind(process.env.SUPABASE_SERVICE_ROLE_KEY);
  checks.push({ name: "Supabase key", ok: kind.ok, detail: kind.label });
  if (!origin || !process.env.SUPABASE_SERVICE_ROLE_KEY) return checks;

  let db;
  try {
    db = supabaseAdmin();
  } catch (e) {
    checks.push({ name: "Connect", ok: false, detail: e instanceof Error ? e.message : String(e) });
    return checks;
  }
  for (const t of TABLES) {
    const { error } = await db.from(t).select("*", { count: "exact", head: true });
    checks.push({ name: `Table ${t}`, ok: !error, detail: error ? error.message || error.code || "error" : "found" });
  }
  for (const b of [DOCUMENTS_BUCKET, RECORDS_BUCKET]) {
    const { error } = await db.storage.getBucket(b);
    checks.push({ name: `Storage ${b}`, ok: !error, detail: error ? error.message : "found" });
  }
  return checks;
}

export default async function HealthPage() {
  const checks = await runChecks();
  const allOk = checks.every((c) => c.ok);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy-900">Setup check</h1>
      <p className={allOk ? "text-green-700" : "text-red-700"}>
        {allOk ? "Everything is connected." : "Something needs fixing. The first red line is usually the cause."}
      </p>
      <ul className="divide-y divide-slate-200 rounded-xl bg-white ring-1 ring-slate-200">
        {checks.map((c) => (
          <li key={c.name} className="flex gap-3 px-4 py-2 text-sm">
            <span className={c.ok ? "text-green-700" : "text-red-700"}>{c.ok ? "✓" : "✗"}</span>
            <span className="w-44 shrink-0 font-medium text-slate-800">{c.name}</span>
            <span className="break-all text-slate-600">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
