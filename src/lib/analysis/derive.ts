import { z } from "zod/v4";

/**
 * The figures the financial analysis is built from. The report writer copies them from the
 * reviewers' notes (each with its pages); everything in `deriveMetrics` is then plain
 * arithmetic in code, so a derived number is reproducible and can be checked by hand.
 */
const Amount = z
  .object({
    amount: z.number().describe("Dollars, as a plain number (no $ or commas)"),
    as_of: z.string().describe("Date or period the figure is for, e.g. 'March 31, 2026' or '2025/26 budget'"),
    pages: z.array(z.number()),
  })
  .nullable();

export const FiguresSchema = z.object({
  lots_total: z.number().nullable().describe("Number of strata lots in the strata corporation (all sections)"),
  lot_entitlement: z.number().nullable().describe("This lot's unit entitlement"),
  total_entitlement: z.number().nullable().describe("Total unit entitlement of the strata (all lots)"),
  monthly_fee: Amount.describe("This lot's current monthly strata fee, total"),
  monthly_fee_crf_part: z.number().nullable().describe("The CRF part of this lot's monthly fee, if the fee schedule splits it"),
  crf_balance: Amount.describe("Newest contingency reserve fund balance"),
  annual_crf_contribution: Amount.describe("Current annual CRF contribution in the approved budget"),
  recommended_contribution: z
    .object({
      amount: z.number().describe("Annual CRF contribution the depreciation report recommends, for the first year"),
      scenario: z.string().describe("The report's name for that funding scenario"),
      pages: z.array(z.number()),
    })
    .nullable(),
  capital_forecast: z
    .array(z.object({ year: z.number(), amount: z.number(), pages: z.array(z.number()) }))
    .describe("Depreciation report forecast capital spending by year, for the next 10 years from today, as given (state in the notes whether inflated)"),
  fee_history: z
    .array(z.object({ year: z.string().describe("e.g. '2024/25'"), monthly_fee: z.number(), pages: z.array(z.number()) }))
    .describe("This lot's monthly fee in each year the documents show, oldest first"),
  operating_result: z
    .object({ amount: z.number().describe("Surplus positive, deficit negative"), period: z.string(), pages: z.array(z.number()) })
    .nullable(),
  water_deductible: Amount.describe("Strata insurance water damage deductible"),
});
export type Figures = z.infer<typeof FiguresSchema>;

export type DerivedMetrics = {
  /** This lot's share of strata-wide costs, as a fraction, when both entitlements are known. */
  share: number | null;
  crfPerLot: number | null;
  forecast3yr: { from: number; to: number; amount: number; pages: number[] } | null;
  coverage3yr: number | null;
  forecast10yrPerLot: number | null;
  forecast10yr: number | null;
  lotMonthlyCrfNow: number | null;
  lotMonthlyCrfRecommended: number | null;
  feeIfRecommended: number | null;
  levyShare: (strataTotal: number) => number | null;
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;

/** "$10,900" style rounding used for illustrations: to the nearest $100 above $1,000. */
export function aboutDollars(n: number) {
  const r = Math.abs(n) >= 1000 ? Math.round(n / 100) * 100 : Math.round(n);
  return `about ${money(r)}`;
}

export function deriveMetrics(f: Figures, todayYear: number): DerivedMetrics {
  const share = f.lot_entitlement && f.total_entitlement && f.total_entitlement > 0 ? f.lot_entitlement / f.total_entitlement : null;
  const lots = f.lots_total && f.lots_total > 0 ? f.lots_total : null;
  const crf = f.crf_balance?.amount ?? null;

  const years = [...f.capital_forecast].filter((y) => y.year >= todayYear).sort((a, b) => a.year - b.year);
  const next3 = years.filter((y) => y.year < todayYear + 3);
  const forecast3yr = next3.length
    ? { from: todayYear, to: todayYear + 2, amount: next3.reduce((a, y) => a + y.amount, 0), pages: next3.flatMap((y) => y.pages) }
    : null;
  const next10 = years.filter((y) => y.year < todayYear + 10);
  const forecast10yr = next10.length ? next10.reduce((a, y) => a + y.amount, 0) : null;

  const contrib = f.annual_crf_contribution?.amount ?? null;
  const lotMonthlyCrfNow = f.monthly_fee_crf_part ?? (share && contrib != null ? (contrib * share) / 12 : null);
  const lotMonthlyCrfRecommended = share && f.recommended_contribution ? (f.recommended_contribution.amount * share) / 12 : null;
  const feeIfRecommended =
    f.monthly_fee && lotMonthlyCrfNow != null && lotMonthlyCrfRecommended != null
      ? f.monthly_fee.amount - lotMonthlyCrfNow + lotMonthlyCrfRecommended
      : null;

  return {
    share,
    crfPerLot: crf != null && lots ? crf / lots : null,
    forecast3yr,
    coverage3yr: crf != null && forecast3yr && forecast3yr.amount > 0 ? crf / forecast3yr.amount : null,
    forecast10yr,
    forecast10yrPerLot: forecast10yr != null && lots ? forecast10yr / lots : null,
    lotMonthlyCrfNow,
    lotMonthlyCrfRecommended,
    feeIfRecommended,
    levyShare: (total: number) => (share ? total * share : null),
  };
}

/** Pulls a dollar amount out of text like "$7,487,425" or "$17.5 million". */
export function parseDollars(text: string): number | null {
  const m = text.replace(/,/g, "").match(/\$\s*([0-9]+(?:\.[0-9]+)?)\s*(million|m\b|thousand|k\b)?/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]?.toLowerCase();
  if (unit === "million" || unit === "m") return n * 1_000_000;
  if (unit === "thousand" || unit === "k") return n * 1_000;
  return n;
}

export { money };
