import { logger, task } from "@trigger.dev/sdk";

/**
 * Runs after a buyer submits their documents.
 * For now it only records that the order arrived. The analysis steps
 * (split and OCR the PDFs, classify each document, review against the BC
 * checklist, draft the report, route Expert orders to Brian) come next.
 */
export const processOrderTask = task({
  id: "process-order",
  maxDuration: 3600,
  run: async (payload: { orderId: string }) => {
    logger.log("Order submitted for analysis", { orderId: payload.orderId });
    return { orderId: payload.orderId, status: "queued-for-analysis" };
  },
});
