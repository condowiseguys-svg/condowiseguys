import { z } from "zod/v4";
import { askForJson } from "./claude";
import type { Segment } from "./classify";
import { describeSegments, type GroupReview, type OrderContext } from "./review";

const Risk = z.enum(["red", "amber", "green"]);
const Item = z.object({
  text: z.string(),
  risk: Risk.nullable().describe("null for neutral information"),
  pages: z.array(z.number()),
});

/** Report section ids, in the order they appear. Matches what the website promises. */
export const SECTION_IDS = ["financial", "depreciation", "minutes", "bylaws", "insurance", "other"] as const;
export const SECTION_TITLES: Record<(typeof SECTION_IDS)[number], string> = {
  financial: "Financial health: budget, fees, operating results, reserves",
  depreciation: "Depreciation report and major projects",
  minutes: "Meeting minutes: projects, leaks, disputes",
  bylaws: "Bylaws and rules that affect you",
  insurance: "Insurance coverage and deductibles",
  other: "Building condition, legal matters and other documents",
};

export const ReportSchema = z.object({
  rating: Risk.describe("Overall rating: red = serious costs or risks likely; amber = some concerns; green = no major concerns found"),
  rating_headline: z.string().describe("A few words after the rating, e.g. 'plan for large special levies'"),
  summary: z.string().describe("Executive summary, one paragraph of 3 to 6 sentences for the buyer"),
  top_findings: z.array(Item).describe("The 4 to 8 most important findings, most important first, including at least one green item if any exist"),
  key_numbers: z
    .array(z.object({ label: z.string(), value: z.string(), pages: z.array(z.number()) }))
    .describe("Monthly strata fee, CRF balance, CRF contribution, special levies, deductibles, depreciation report date, etc."),
  levies: z
    .object({
      rows: z.array(
        z.object({
          period: z.string(),
          status: z.enum(["approved", "proposed", "forecast"]),
          strata_total: z.string(),
          unit_share: z.string().describe("Estimated share for this lot, e.g. 'about $10,900', or 'unknown'"),
          pages: z.array(z.number()),
        }),
      ),
      basis: z.string().describe("How the unit share was estimated (e.g. unit entitlement 42 of 30,000) and its limits"),
    })
    .nullable()
    .describe("Special levies approved, proposed, or forecast; null if none were found"),
  form_b: z
    .array(z.object({ item: z.string(), answer: z.string(), risk: Risk.nullable(), pages: z.array(z.number()) }))
    .describe("Form B line by line; empty if there was no Form B"),
  sections: z.array(
    z.object({
      id: z.enum(SECTION_IDS),
      intro: z.string().describe("One or two sentences on what was reviewed for this section and the overall picture"),
      items: z.array(Item),
    }),
  ),
  missing_documents: z.array(z.object({ document: z.string(), why_it_matters: z.string() })),
  questions: z.array(z.string()).describe("Questions to ask before removing subjects, most important first, at most 12"),
});
export type Report = z.infer<typeof ReportSchema>;

const SYSTEM = `You write the review report for Condo Wise Guys, a British Columbia service that reviews strata (condominium) documents for home buyers before they remove subjects.
You receive the order, the list of documents in the package, and reviewers' notes for each group of documents. Turn them into the final report.

Rules:
- Use only facts in the notes. Never invent numbers, dates, or page references. Keep the page numbers from the notes.
- When a special levy is forecast or approved for the whole strata and this lot's unit entitlement and the total unit entitlement are known, estimate this lot's share (amount x lot entitlement / total entitlement), round it ("about $10,900") and explain the basis. If they are not known, say "unknown" and add a question asking for the lot's share.
- Rate overall: red if the buyer is likely to face large costs (e.g. big special levies, underfunded reserves facing major work, serious unresolved building problems, litigation); amber if there are concerns worth investigating; green if no major concerns were found. Explain the rating in the summary.
- Write plainly for a buyer who is not an expert, in Canadian English. Be specific, balanced and calm. No legal advice; suggest asking a lawyer or inspector where appropriate.
- Fill every section; if nothing relevant was provided for a section, say so in its intro and leave items empty.
- List missing documents only from the list you are given or where the notes clearly show something important is missing or out of date.`;

export async function composeReport(opts: {
  orderId: string;
  submission: number;
  runSlug: string;
  order: OrderContext;
  segments: Segment[];
  reviews: { group: string; title: string; review: GroupReview }[];
  missing: string[];
}): Promise<Report> {
  const notes = opts.reviews.map((r) => `<notes group="${r.group}" title="${r.title}">\n${JSON.stringify(r.review)}\n</notes>`).join("\n");
  return askForJson({
    orderId: opts.orderId,
    step: "Write report",
    costKey: `claude:compose:${opts.orderId}:s${opts.submission}:${opts.runSlug}`,
    schema: ReportSchema,
    system: SYSTEM,
    effort: "high",
    content: [
      {
        type: "text",
        text: `<order>
Property: ${opts.order.property_address}
Unit: ${opts.order.unit_number || "not given"}
Strata plan: ${opts.order.strata_plan || "not given"}
${opts.order.notes ? `Buyer's notes: ${opts.order.notes}` : ""}
</order>

<package_contents>
${describeSegments(opts.segments)}
</package_contents>

<not_found_in_package>
${opts.missing.length ? opts.missing.map((m) => `- ${m}`).join("\n") : "Nothing required appears to be missing."}
</not_found_in_package>

${notes}

Write the report. Section ids: financial, depreciation, minutes, bylaws, insurance, other (one of each, in that order).`,
      },
    ],
  });
}
