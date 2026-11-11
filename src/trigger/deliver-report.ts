import { task } from "@trigger.dev/sdk";
import { raiseIssue } from "@/lib/ops/events";
import { deliverReport } from "@/lib/ops/records";

/**
 * Emails an approved report. Triggered with the key deliver:<report version>, so the
 * same version is only ever queued once, and sendEmailOnce() guarantees one email even
 * if this task retries after Resend already accepted it.
 */
export const deliverReportTask = task({
  id: "deliver-report",
  maxDuration: 300,
  retry: { maxAttempts: 5, minTimeoutInMs: 5000, maxTimeoutInMs: 120000, factor: 3 },
  run: async (payload: { orderId: string; reportVersionId: string }) => {
    return { result: await deliverReport(payload.orderId) };
  },
  onFailure: async ({ payload, error }) => {
    await raiseIssue({
      orderId: payload.orderId,
      kind: "delivery_failed",
      message: `Report email failed after retries: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
      dedupeKey: `delivery-failed:${payload.reportVersionId}`,
    });
  },
});
