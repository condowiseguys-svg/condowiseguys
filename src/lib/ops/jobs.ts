import { tasks } from "@trigger.dev/sdk";
import type { deliverReportTask } from "@/trigger/deliver-report";
import type { processOrderTask } from "@/trigger/process-order";
import { deliverReport } from "./records";
import { raiseIssue } from "./events";

export function jobsConfigured() {
  return Boolean(process.env.TRIGGER_SECRET_KEY);
}

/** Starts processing for one submission. The idempotency key makes repeat calls harmless. */
export async function startProcessing(orderId: string, submission: number, attemptTag = "") {
  if (!jobsConfigured()) {
    await raiseIssue({
      orderId,
      kind: "processing_failed",
      message: "Background jobs aren't set up (TRIGGER_SECRET_KEY), so processing did not start.",
      dedupeKey: `jobs-not-configured:${orderId}:${submission}`,
    });
    return false;
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
