import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import type { deliverReportTask } from "@/trigger/deliver-report";
import type { processOrderTask } from "@/trigger/process-order";
import { deliverReport } from "./records";
import { logEvent, raiseIssue } from "./events";
import { runDocumentChecks } from "./processing";

export function jobsConfigured() {
  return Boolean(process.env.TRIGGER_SECRET_KEY);
}

/** Starts processing for one submission. The idempotency key makes repeat calls harmless. */
export async function startProcessing(orderId: string, submission: number, attemptTag = "") {
  if (!jobsConfigured()) {
    // No Trigger.dev yet: run the checks on the web server once the response has been sent.
    const runId = `inline:${randomUUID()}`;
    after(async () => {
      try {
        await runDocumentChecks(orderId, submission, runId);
      } catch (err) {
        console.error("inline processing failed", err);
        await logEvent(orderId, "system", "processing_failed", { run: runId });
        await raiseIssue({
          orderId,
          kind: "processing_failed",
          message: `Processing failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500),
          dedupeKey: `processing-failed:${runId}`,
        });
      }
    });
    return true;
  }
  await tasks.trigger<typeof processOrderTask>(
    "process-order",
    { orderId, submission },
    { idempotencyKey: `process-order:${orderId}:${submission}${attemptTag}`, tags: [`order:${orderId}`] },
  );
  return true;
}

/** Queues delivery of an approved version once. Falls back to sending inline without Trigger.dev. */
export async function startDelivery(orderId: string, reportVersionId: string, attemptTag = "") {
  if (!jobsConfigured()) return deliverReport(orderId);
  await tasks.trigger<typeof deliverReportTask>(
    "deliver-report",
    { orderId, reportVersionId },
    { idempotencyKey: `deliver:${reportVersionId}${attemptTag}`, tags: [`order:${orderId}`] },
  );
  return "queued" as const;
}
