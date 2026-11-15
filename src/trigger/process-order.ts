import { logger, task, usage } from "@trigger.dev/sdk";
import { draftReport, routeDraft } from "@/lib/analysis/pipeline";
import { recordCost } from "@/lib/ops/costs";
import { logEvent, raiseIssue } from "@/lib/ops/events";
import { runDocumentChecks } from "@/lib/ops/processing";
import { deliverReportTask } from "./deliver-report";

/**
 * Runs after a buyer submits (or resubmits) their documents.
 *
 * 1. Check every file can be opened (unreadable ones go back to the buyer).
 * 2. Draft the report: read every page (scans by Claude), sort the package into documents,
 *    review each group against the BC checklist, write the report and save it as a draft.
 * 3. Standard orders with AUTO_SEND_STANDARD on are approved and emailed; everything else
 *    moves to "in review" and Brian gets an email.
 *
 * Duplicate protection:
 *  - It is triggered with the idempotency key process-order:<order>:<submission>, so a
 *    double click or a repeated request starts only one run per submission.
 *  - claim_order_processing() lets only that run work on the order; any other run exits.
 *  - Every step writes with its own key (document fingerprints, saved analysis steps,
 *    issues, emails, costs, the draft version), so a retried attempt picks up where it
 *    left off without paying for or repeating finished work.
 */
export const processOrderTask = task({
  id: "process-order",
  maxDuration: 3600,
  machine: "medium-1x",
  retry: { maxAttempts: 3 },
  run: async (payload: { orderId: string; submission: number }, { ctx }) => {
    const runId = ctx.run.id;
    const checked = await runDocumentChecks(payload.orderId, payload.submission, runId, ctx.attempt.number === 1);
    if ("skipped" in checked) {
      logger.log("Another run owns this order, or it is no longer processing. Skipping.", payload);
      return checked;
    }
    if (checked.status !== "ready_for_analysis") {
      await recordRunCost(payload.orderId, runId);
      return checked;
    }

    const drafted = await draftReport(payload.orderId, payload.submission, runId);
    if (drafted.status !== "drafted") {
      logger.log("The order changed while the report was being written. Leaving it alone.", payload);
      await recordRunCost(payload.orderId, runId);
      return drafted;
    }
    const routed = await routeDraft(payload.orderId, drafted.version.id, drafted.report.rating, drafted.missing, {
      scanned: drafted.scanned,
      unreadable: drafted.unreadable,
    });
    if (routed.approvedVersionId) {
      await deliverReportTask.trigger(
        { orderId: payload.orderId, reportVersionId: routed.approvedVersionId },
        { idempotencyKey: `deliver:${routed.approvedVersionId}`, tags: [`order:${payload.orderId}`] },
      );
    }
    await recordRunCost(payload.orderId, runId);
    return { status: routed.status, version: drafted.version.version, rating: drafted.report.rating };
  },
  onFailure: async ({ payload, error, ctx }) => {
    await logEvent(payload.orderId, "system", "processing_failed", { run: ctx.run.id });
    await raiseIssue({
      orderId: payload.orderId,
      kind: "processing_failed",
      message: `Processing failed after retries: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
      dedupeKey: `processing-failed:${ctx.run.id}`,
    });
  },
});

async function recordRunCost(orderId: string, runId: string) {
  const current = usage.getCurrent();
  await recordCost({
    orderId,
    category: "compute",
    description: "Trigger.dev processing run",
    costCents: current.totalCostInCents,
    currency: "usd",
    key: `compute:${runId}`,
    units: { durationMs: current.compute.total.durationMs },
  });
}
