import { logEvent } from "@/lib/ops/events";
import { emailHtml, escapeHtml, sendEmailOnce } from "@/lib/ops/email";
import { missingRequired } from "@/lib/ops/package-checklist";
import { approveReportVersion, buildManifest, createReportVersion } from "@/lib/ops/records";
import { siteUrl } from "@/lib/ops/urls";
import { DOCUMENTS_BUCKET, supabaseAdmin } from "@/lib/supabase/admin";
import { cachedStep, stepPath } from "./cache";
import { REVIEW_GROUPS, SATISFIES } from "./checklist";
import { classifyPackage, type Segment } from "./classify";
import { analysisModel } from "./claude";
import { composeReport, type Report } from "./compose";
import { extractDocument, type PageText } from "./extract";
import { makeCiter, numberPages } from "./pages";
import { mapLimit } from "./pool";
import { renderReportPdf } from "./render-pdf";
import { groupChunks, reviewGroup, type GroupReview, type OrderContext } from "./review";

type OrderRow = OrderContext & {
  id: string;
  status: string;
  tier: "standard" | "expert";
  buyer_name: string;
  processing_run_id: string | null;
  submission_count: number;
};

/** Standard reports are emailed without Brian's check only when AUTO_SEND_STANDARD=true. */
export function autoSendStandard() {
  return /^(1|true|yes|on)$/i.test(process.env.AUTO_SEND_STANDARD ?? "");
}

function contactEmail() {
  const from = process.env.EMAIL_FROM ?? "";
  return from.match(/<([^>]+)>/)?.[1] ?? (from.includes("@") ? from.trim() : "report@condowiseguys.com");
}

async function loadOrder(orderId: string) {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("id, status, tier, buyer_name, property_address, unit_number, strata_plan, notes, processing_run_id, submission_count")
    .eq("id", orderId)
    .single();
  if (error || !data) throw error ?? new Error("Order not found");
  return data as OrderRow;
}

/** True while this run still owns the order (Brian hasn't re-run it or acted on it meanwhile). */
async function stillOurs(orderId: string, runId: string, submission: number) {
  const o = await loadOrder(orderId);
  return o.status === "processing" && o.processing_run_id === runId && o.submission_count === submission;
}

/**
 * Reads the package, sorts it into documents, reviews each group against the BC checklist,
 * writes the report and saves it as a draft version. Each step's result is saved, so a
 * retry continues where the last attempt stopped.
 */
export async function draftReport(orderId: string, submission: number, runId: string) {
  const order = await loadOrder(orderId);
  const manifest = await buildManifest(orderId);
  if (!manifest.length) throw new Error("No readable documents to review.");
  const db = supabaseAdmin();
  const path = (step: string) => stepPath(orderId, submission, step);
  // Reading, sorting and reviewing are reused by a re-run of the same submission; the
  // written report is per run, so "Re-run processing" gives Brian a freshly written draft.
  const runSlug = runId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);

  // 1. Text of every page, scans read by Claude.
  const perDoc: PageText[][] = [];
  for (const [i, doc] of manifest.entries()) {
    perDoc.push(
      await cachedStep(path(`pages-${doc.sha256.slice(0, 16)}`), async () => {
        const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).download(doc.storage_path);
        if (error || !data) throw error ?? new Error(`Could not download ${doc.file_name}`);
        const bytes = new Uint8Array(await data.arrayBuffer());
        return extractDocument({ orderId, submission, docIndex: i, doc, bytes });
      }),
    );
    // Position in the manifest can change between submissions; keep it current.
    perDoc[i] = perDoc[i].map((p) => ({ ...p, doc: i }));
  }
  const pages = numberPages(perDoc);
  const ocrPages = pages.filter((p) => p.source === "ocr").length;
  await logEvent(orderId, "system", "analysis_pages_read", { pages: pages.length, scanned: ocrPages, files: manifest.length });

  // 2. Which documents are in the package.
  const segments = await cachedStep<Segment[]>(path("segments"), () => classifyPackage(orderId, submission, pages));
  const found = new Set(segments.map((s) => SATISFIES[s.type]).filter(Boolean) as string[]);
  const missing = missingRequired(found).map((m) => m.label);
  await logEvent(orderId, "system", "analysis_documents_sorted", { documents: segments.length, missing });

  // 3. Review each group of documents against its checklist.
  const jobs = REVIEW_GROUPS.flatMap((group) =>
    groupChunks(group, segments, pages).map((chunk, k, all) => ({ group, chunk, k, count: all.length })),
  );
  const reviews = await mapLimit(jobs, 3, async ({ group, chunk, k, count }) => ({
    group: group.id,
    title: count > 1 ? `${group.title} (part ${k + 1} of ${count})` : group.title,
    review: await cachedStep<GroupReview>(path(`review-${group.id}-${k}`), () =>
      reviewGroup({
        orderId,
        submission,
        group,
        chunkIndex: k,
        chunkCount: count,
        segments: chunk.segments,
        allSegments: segments,
        pages: chunk.pages,
        order,
      }),
    ),
  }));
  await logEvent(orderId, "system", "analysis_reviewed", { groups: reviews.length });

  // 4. Write the report.
  const report = await cachedStep<Report>(path(`report-${runSlug}`), () =>
    composeReport({ orderId, submission, runSlug, order, segments, reviews, missing }),
  );

  // 5. Draw the PDF and save it as a draft version. The draft date is fixed by the saved
  // step so a retry produces the same file.
  const meta = await cachedStep(path(`meta-${runSlug}`), async () => ({ preparedOn: new Date().toISOString() }));
  const pdf = await renderReportPdf(
    report,
    segments,
    {
      orderId,
      propertyAddress: order.property_address,
      unitNumber: order.unit_number,
      strataPlan: order.strata_plan,
      buyerName: order.buyer_name,
      tier: order.tier,
      preparedOn: new Date(meta.preparedOn),
      totalPages: pages.length,
      fileCount: manifest.length,
      ocrPages,
      contactEmail: contactEmail(),
    },
    makeCiter(pages, manifest),
  );

  if (!(await stillOurs(orderId, runId, submission))) return { status: "superseded" as const };
  const version = await createReportVersion({
    orderId,
    pdf,
    createdBy: `pipeline:${runId}`,
    sourceKey: `pipeline:${runId}`,
    model: analysisModel(),
  });
  return { status: "drafted" as const, version, report, missing };
}

/**
 * After a draft exists: Standard orders are approved and emailed automatically (when
 * AUTO_SEND_STANDARD is on); everything else waits for Brian in the admin dashboard.
 */
export async function routeDraft(
  orderId: string,
  versionId: string,
  rating: string,
  missing: string[],
): Promise<{ status: string; approvedVersionId: string | null }> {
  const order = await loadOrder(orderId);
  if (order.status !== "processing") return { status: order.status, approvedVersionId: null };

  if (order.tier === "standard" && autoSendStandard()) {
    const v = await approveReportVersion(versionId, "auto");
    return { status: "approved", approvedVersionId: v.id };
  }

  const { data: moved } = await supabaseAdmin()
    .from("orders")
    .update({ status: "in_review" })
    .eq("id", orderId)
    .eq("status", "processing")
    .select("id");
  if (moved?.length) {
    await logEvent(orderId, "system", "ready_for_review", { versionId, rating, missing });
    const adminTo = process.env.ADMIN_EMAIL || contactEmail();
    const link = `${siteUrl()}/admin/orders/${orderId}`;
    await sendEmailOnce({
      key: `review-ready:${versionId}`,
      orderId,
      kind: "admin_review_ready",
      to: adminTo,
      subject: `Report ready for your check: ${order.property_address}`,
      html: emailHtml(
        [
          `The draft report for <strong>${escapeHtml(order.property_address)}</strong> (${order.tier === "expert" ? "Expert Reviewed" : "Standard"}) is ready.`,
          `Overall rating: <strong>${escapeHtml(rating)}</strong>.${
            missing.length ? ` Not found in the package: ${missing.map(escapeHtml).join(", ")}.` : ""
          }`,
          "Open the order to read the draft, then approve and send it, or ask the buyer for more documents.",
        ],
        { href: link, label: "Open the order" },
      ),
      text: `The draft report for ${order.property_address} is ready. Rating: ${rating}.\n${link}\n`,
    });
  }
  return { status: "in_review", approvedVersionId: null };
}
