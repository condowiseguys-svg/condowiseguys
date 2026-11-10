import { supabaseAdmin } from "@/lib/supabase/admin";

export type CostCategory = "claude" | "compute" | "payment_fee" | "email" | "other";

/**
 * Claude API list prices in USD per million tokens. Check these against
 * https://claude.com/pricing when models or prices change.
 */
export const CLAUDE_PRICES_USD_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

/** USD to CAD for the dashboard. Set USD_TO_CAD in Vercel to update it. */
export function usdToCad() {
  const n = Number(process.env.USD_TO_CAD);
  return Number.isFinite(n) && n > 0 ? n : 1.38;
}

/** Records a cost once. Retrying the same step with the same key never double counts. */
export async function recordCost(cost: {
  orderId: string;
  category: CostCategory;
  description: string;
  costCents: number;
  currency: "cad" | "usd";
  key: string;
  units?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin()
    .from("order_costs")
    .upsert(
      {
        order_id: cost.orderId,
        category: cost.category,
        description: cost.description,
        cost_cents: Number(cost.costCents.toFixed(4)),
        currency: cost.currency,
        units: cost.units ?? {},
        idempotency_key: cost.key,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );
  if (error) console.error("order_costs insert failed", cost.key, error);
}

/** Token counts as reported in a Claude API response's `usage` field. */
export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function claudeCostUsdCents(model: string, usage: ClaudeUsage) {
  const p = CLAUDE_PRICES_USD_PER_MTOK[model];
  if (!p) return null;
  const dollars =
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000;
  return dollars * 100;
}

/** Call after every Claude request in the pipeline, with a key unique to that step. */
export async function recordClaudeUsage(orderId: string, step: string, model: string, usage: ClaudeUsage, key: string) {
  const cents = claudeCostUsdCents(model, usage);
  if (cents === null) console.warn(`No price for ${model}; recording 0`);
  await recordCost({
    orderId,
    category: "claude",
    description: `${step} (${model})`,
    costCents: cents ?? 0,
    currency: "usd",
    key,
    units: { model, ...usage },
  });
}
