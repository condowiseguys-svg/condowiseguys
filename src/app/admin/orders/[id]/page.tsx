import Link from "next/link";
import { notFound } from "next/navigation";
import { costCad, type OrderCostLine } from "@/lib/ops/costs-view";
import { PACKAGE_ITEMS } from "@/lib/ops/package-checklist";
import { tiers } from "@/lib/site";
import { DOCUMENTS_BUCKET, RECORDS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import {
  approveAndSend,
  discardDraft,
  requestDocuments,
  rerunProcessing,
  resolveIssue,
  retryDelivery,
  uploadReport,
} from "../../actions";
import { STATUS_LABEL, money, when } from "../../format";

// Document checks can run here after the response when Trigger.dev is not set up.
export const maxDuration = 300;

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-navy-900">{title}</h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold";
const primary = `${btn} bg-brand-600 text-white hover:bg-brand-500`;
const secondary = `${btn} bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50`;

export default async function AdminOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { id } = await params;
  const { msg } = await searchParams;
  if (!UUID.test(id)) notFound();
  const db = supabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();

  const [docs, issues, versions, costs, events] = await Promise.all([
    db.from("order_documents").select("*").eq("order_id", id).order("created_at"),
    db.from("order_issues").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("report_versions").select("*").eq("order_id", id).order("version", { ascending: false }),
    db.from("order_costs").select("*").eq("order_id", id).order("created_at"),
    db.from("order_events").select("*").eq("order_id", id).order("at", { ascending: false }).limit(100),
  ]);

  const docLinks = new Map<string, string>();
  for (const d of docs.data ?? []) {
    const { data } = await db.storage.from(DOCUMENTS_BUCKET).createSignedUrl(d.storage_path, 600);
    if (data) docLinks.set(d.id, data.signedUrl);
  }
  const reportLinks = new Map<string, string>();
  for (const v of versions.data ?? []) {
    const { data } = v.archive_path
      ? await db.storage.from(RECORDS_BUCKET).createSignedUrl(`${v.archive_path}/report.pdf`, 600)
      : await db.storage.from(DOCUMENTS_BUCKET).createSignedUrl(v.storage_path, 600);
    if (data) reportLinks.set(v.id, data.signedUrl);
  }

  const tier = tiers.find((t) => t.id === order.tier);
  const costLines = (costs.data ?? []) as (OrderCostLine & { id: string; description: string; created_at: string })[];
  const totalCost = costCad(costLines);
  const openIssues = (issues.data ?? []).filter((i) => !i.resolved_at);
  const canApprove = ["processing", "in_review"].includes(order.status);
  const canAsk = ["processing", "in_review"].includes(order.status);

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-brand-600 hover:underline">
        ← All orders
      </Link>
      {msg && (
        <p
          className={`rounded-lg px-4 py-3 text-sm ring-1 ${
            msg.startsWith("Error") ? "bg-red-50 text-risk-red ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
          }`}
        >
          {msg}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">{order.property_address}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {order.unit_number ? `Unit ${order.unit_number} · ` : ""}
            {order.strata_plan ? `${order.strata_plan} · ` : ""}
            {tier?.name}
            {order.rush ? " + Rush" : ""} · {money(order.amount_cents)} · order {order.id.slice(0, 8)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {order.buyer_name} · {order.buyer_email}
            {order.buyer_phone ? ` · ${order.buyer_phone}` : ""}
            {order.subject_removal_date ? ` · subject removal ${order.subject_removal_date}` : ""}
          </p>
        </div>
        <span className="self-start rounded-full bg-navy-900 px-3 py-1 text-sm font-medium text-white sm:self-auto">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>
      {order.notes && <p className="rounded-lg bg-white p-4 text-sm text-slate-700 ring-1 ring-slate-200">“{order.notes}”</p>}

      <Card title={`Open issues (${openIssues.length})`}>
        {openIssues.length === 0 ? (
          <p className="text-sm text-slate-500">None.</p>
        ) : (
          <ul className="space-y-3">
            {openIssues.map((i) => (
              <li key={i.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-medium text-slate-900">{i.message}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {i.kind.replace(/_/g, " ")} · {when(i.created_at)} · {i.buyer_visible ? "buyer can see this" : "only you"}
                </p>
                <form action={resolveIssue.bind(null, id, i.id)} className="mt-2 flex gap-2">
                  <input name="resolution" placeholder="What did you do?" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1" />
                  <button className={secondary}>Resolve</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {order.status === "processing" && (
            <form action={rerunProcessing.bind(null, id)}>
              <button className={secondary}>Re-run processing</button>
            </form>
          )}
          {order.status === "approved" && order.approved_report_id && (
            <form action={retryDelivery.bind(null, id, order.approved_report_id)}>
              <button className={secondary}>Retry delivery</button>
            </form>
          )}
        </div>
      </Card>

      <Card title={`Documents (${docs.data?.length ?? 0})`}>
        <ul className="divide-y divide-slate-100 text-sm">
          {(docs.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <a href={docLinks.get(d.id)} className="truncate font-medium text-brand-600 hover:underline" target="_blank" rel="noreferrer">
                  {d.file_name}
                </a>
                <p className="text-xs text-slate-500">
                  {d.page_count ? `${d.page_count} pages · ` : ""}
                  {(Number(d.size_bytes ?? 0) / 1048576).toFixed(1)} MB
                  {d.check_detail ? ` · ${d.check_detail}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs">
                <span className={d.check_status === "ok" ? "text-risk-green" : d.check_status === "pending" ? "text-slate-500" : "text-risk-red"}>
                  {d.check_status}
                </span>
                {d.sha256 && <p className="font-mono text-slate-400" title={d.sha256}>{d.sha256.slice(0, 12)}</p>}
              </div>
            </li>
          ))}
        </ul>
        {canAsk && (
          <details className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-800">Ask the buyer for missing documents</summary>
            <form action={requestDocuments.bind(null, id)} className="mt-3 space-y-2">
              {PACKAGE_ITEMS.map((i) => (
                <label key={i.id} className="flex items-center gap-2">
                  <input type="checkbox" name="items" value={i.id} />
                  {i.label}
                </label>
              ))}
              <textarea name="note" rows={2} placeholder="Anything else (optional)" className="w-full rounded-md border border-slate-300 px-2 py-1" />
              <button className={primary}>Email the buyer</button>
              <p className="text-xs text-slate-500">The order moves to “Waiting on buyer” and their upload page reopens.</p>
            </form>
          </details>
        )}
      </Card>

      <Card title="Report versions">
        {(versions.data ?? []).length === 0 && <p className="text-sm text-slate-500">No report yet.</p>}
        <ul className="space-y-3 text-sm">
          {(versions.data ?? []).map((v) => (
            <li key={v.id} className="rounded-lg bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-slate-900">
                  Version {v.version}{" "}
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
                      v.status === "approved" ? "bg-emerald-100 text-emerald-800" : v.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {v.status}
                  </span>
                </p>
                <a href={reportLinks.get(v.id)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  Open PDF
                </a>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Created {when(v.created_at)} by {v.created_by} · based on {v.source_manifest.length} documents · SHA-256{" "}
                <span className="font-mono">{v.sha256.slice(0, 12)}</span>
              </p>
              {v.status === "approved" && (
                <p className="mt-1 text-xs text-emerald-800">
                  Approved by {v.approved_by} on {when(v.approved_at)}. Permanent copy at {v.archive_path}.
                </p>
              )}
              {v.status === "draft" && (
                <div className="mt-2 flex gap-2">
                  {canApprove && (
                    <form action={approveAndSend.bind(null, id, v.id)}>
                      <button className={primary}>Approve and send</button>
                    </form>
                  )}
                  <form action={discardDraft.bind(null, id, v.id)}>
                    <button className={secondary}>Discard</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
        {canApprove && (
          <form action={uploadReport.bind(null, id)} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input type="file" name="report" accept="application/pdf" className="text-sm" />
            <button className={secondary}>Upload report PDF</button>
          </form>
        )}
      </Card>

      <Card title="Processing cost" aside={<span className="font-semibold tabular-nums">{money(totalCost)}</span>}>
        {costLines.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {costLines.map((c) => (
                <tr key={c.id}>
                  <td className="py-1.5 text-slate-700">{c.description}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {(Number(c.cost_cents) / 100).toFixed(4)} {c.currency.toUpperCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-slate-500">Margin: {money(order.amount_cents - totalCost)}</p>
      </Card>

      <Card title="History">
        <ol className="space-y-1.5 text-sm">
          {(events.data ?? []).map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-28 shrink-0 text-slate-500">{when(e.at)}</span>
              <span className="text-slate-800">
                {e.kind.replace(/_/g, " ")} <span className="text-slate-400">({e.actor})</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
