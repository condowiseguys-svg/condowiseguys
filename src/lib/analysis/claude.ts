import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { recordClaudeUsage } from "@/lib/ops/costs";

/**
 * Model used for every step of the report. Set ANALYSIS_MODEL in the environment to change it
 * (for example claude-sonnet-5-5 to lower the cost per report).
 */
export function analysisModel() {
  return process.env.ANALYSIS_MODEL || "claude-opus-5-5";
}

/** Model for reading scanned pages. Defaults to the main model. */
export function ocrModel() {
  return process.env.OCR_MODEL || analysisModel();
}

let client: Anthropic | null = null;
export function claude() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Claude is not configured (ANTHROPIC_API_KEY).");
  }
  client = new Anthropic({ maxRetries: 4 });
  return client;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * One Claude request that must come back as JSON matching `schema`. Streams (pages can
 * be long), records its cost against the order once per `costKey`, and throws on a
 * refusal, a cut-off answer or JSON that doesn't match.
 */
export async function askForJson<S extends z.ZodType>(opts: {
  orderId: string;
  step: string;
  costKey: string;
  schema: S;
  system: string;
  content: Anthropic.ContentBlockParam[];
  effort?: Effort;
  model?: string;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const model = opts.model ?? analysisModel();
  const stream = claude().messages.stream({
    model,
    max_tokens: opts.maxTokens ?? 64000,
    system: opts.system,
    output_config: { effort: opts.effort ?? "high", format: zodOutputFormat(opts.schema) },
    messages: [{ role: "user", content: opts.content }],
  });
  const message = await stream.finalMessage();
  await recordClaudeUsage(opts.orderId, opts.step, model, message.usage, opts.costKey);

  if (message.stop_reason === "refusal") {
    throw new Error(`Claude declined the ${opts.step} step (${message.stop_details?.category ?? "no category"}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(`The ${opts.step} answer was cut off (max_tokens).`);
  }
  if (message.parsed_output == null) {
    throw new Error(`The ${opts.step} answer was not valid JSON for its schema.`);
  }
  return message.parsed_output as z.infer<S>;
}
