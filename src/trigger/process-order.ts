import { logger, task, usage } from "@trigger.dev/sdk";
import { recordCost } from "@/lib/ops/costs";
import { raiseIssue } from "@/lib/ops/events";
import { runDocumentChecks } from "@/lib/ops/processing";

/**
 * Runs after a buyer submits (or resubmits) their documents.
 *
 * Duplicate protection:
 *  - It is triggered with the idempotency key process-order:<order>:<submission>, so a
 *    double click or a repeated request starts only one run per submission.
 *  - claim_order_processing() lets only that run work on the order; any other run exits.
 *  - Every step writes with its own key (document fingerprints, issues, emails, costs),
 *    so a retried attempt picks up where it left off without repeating side effects.
 *
 * Still to come in the analysis step: split and OCR the PDFs, classify each document,
 * check completeness, review against the BC checklist, draft the report, then hand
 * Expert orders to Brian (in_review) and auto-approve Standard ones.
 */
export const processOrderTask = task({
  id: "process-order",
  maxDuration: 3600,
  machine: "small-2x",
  retry: { maxAttempts: 3 },
  run: async (payload: { orderId: string; submission: number }, { ctx }) => {
    const result = await runDocumentChecks(payload.orderId, payload.submission, ctx.run.id, ctx.attempt.number === 1);
    if ("skipped" in result) {
      logger.log("Another run owns this order, or it is no longer processing. Skipping.", payload);
      return result;
    }
    await recordRunCost(payload.orderId, ctx.run.id);
    return result;
  },
  onFailure: async ({ payload, error, ctx }) => {
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
