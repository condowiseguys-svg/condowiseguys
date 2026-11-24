import { logger, task } from "@trigger.dev/sdk";
import { raiseIssue } from "@/lib/ops/events";
import { markArchiveFailed, prepareUpload } from "@/lib/uploads/prepare";

/**
 * Runs once for every file a buyer uploads, as soon as it arrives: checks a PDF or photo, or
 * unpacks a ZIP (up to 1 GB, hundreds of documents) into separate documents. The buyer's
 * upload page shows the results live. Triggered with the idempotency key prepare:<document>.
 *
 * medium-2x (4 GB memory) leaves room for a 500 MB PDF from inside a ZIP; the ZIP itself is
 * streamed to the machine's temporary disk, never held in memory.
 */
export const prepareUploadTask = task({
  id: "prepare-upload",
  machine: "medium-2x",
  maxDuration: 3600,
  retry: { maxAttempts: 3 },
  queue: { concurrencyLimit: 5 },
  run: async (payload: { orderId: string; documentId: string }) => {
    const result = await prepareUpload(payload.documentId);
    logger.log("Prepared upload", { ...payload, ...result });
    return result;
  },
  onFailure: async ({ payload, error }) => {
    const message = error instanceof Error ? error.message : String(error);
    await markArchiveFailed(payload.documentId, message);
    await raiseIssue({
      orderId: payload.orderId,
      kind: "processing_failed",
      message: `Preparing an uploaded file failed after retries: ${message}`.slice(0, 500),
      dedupeKey: `prepare-failed:${payload.documentId}`,
      documentId: payload.documentId,
    });
  },
});
