import { z } from "zod/v4";
import { askForJson } from "./claude";
import { RATING_METHOD, TOP_RED_FLAGS } from "./checklist";
import type { Segment } from "./classify";
import { FiguresSchema } from "./derive";
import { checkReport } from "./qc";
import { describeSegments, type GroupReview, type OrderContext } from "./review";

/**
 * The report follows the Condo Wise Guys Reporting Standards (docs/report-standard.md): the
 * same 21 sections in the same order for every property, and the RED / AMBER / GREEN rating.
 * Do not change the structure, tone or method without Brian A. Hill's approval.
 */
export const SECTION_TITLES = [
  "Property Description",
  "Report Information and Overall Assessment",
  "Executive Summary",
  "Before You Remove Subjects",
  "Top Findings",
  "Key Numbers",
  "Special Levies: Approved, Proposed and Forecast",
  "Form B Review",
  "Red Flag Check – Condo Buyers Guide",
  "Financial Health – Budget, Fees, Operating Results and Reserves",
  "Depreciation Report and Major Projects",
  "Meeting Minutes – Projects, Leaks, Disputes and Significant Events",
  "Bylaws and Rules That Affect You",
  "Insurance Coverage and Deductibles",
  "Building Condition, Legal Matters and Other Documents",
  "Documents to Ask For",
  "Questions to Ask Before Removing Subjects",
  "Related Services, Where Relevant",
  "Documents Reviewed",
  "Scope of Work, Assumptions and Limiting Conditions",
  "Certification",
] as const;

/** The analysis sections 10 to 15, each with its reviewed line and rated items. */
export const ANALYSIS_IDS = ["financial", "depreciation", "minutes", "bylaws", "insurance", "other"] as const;
export type AnalysisId = (typeof ANALYSIS_IDS)[number];
export const analysisSection = (id: AnalysisId) => 10 + ANALYSIS_IDS.indexOf(id);

export const Rating = z.enum(["red", "amber", "green"]);
export type RatingValue = z.infer<typeof Rating>;
const Evidence = z.enum(["documented", "interpretation"]);

const Ref = z.string().describe("The report section with the detail, as a number from 6 to 17, e.g. '11' or '14'");

const Item = z.object({
  text: z.string().describe("The point in plain language, 1 to 3 sentences, with dates and amounts"),
  rating: Rating,
  evidence: Evidence,
  pages: z.array(z.number()),
});

export const ReportSchema = z.object({
  property_description: z
    .string()
    .describe(
      "Section 1. A concise, factual paragraph of 60 to 120 words in the style of an appraisal or depreciation report: address and location, type of development, approximate age or year built, number of buildings and strata lots, general characteristics and common facilities, only as documented. Neutral; not a condition assessment. Say 'not stated in the documents' rather than guess.",
    ),
  report_info: z.object({
    newest_document: z.string().describe("The newest dated document in the package and its date, e.g. 'council minutes April 14, 2026'"),
    newest_document_age: z.string().describe("Its age on today's date, e.g. '7 months old'"),
    depreciation_report: z.string().describe("Author and date of the newest depreciation report, or 'none in package'"),
    management: z.string().describe("'Professionally managed' or 'Self-managed'; do not name individual managers"),
  }),
  overall: z.object({
    rating: Rating.describe("The overall assessment: the most serious of the three area ratings"),
    statement: z.string().describe("One or two sentences explaining the overall rating"),
    areas: z
      .array(
        z.object({
          area: z.enum(["building", "finances", "insurance_legal"]),
          rating: Rating,
          why: z.string().describe("One or two sentences with the deciding facts"),
          refs: z.array(Ref),
        }),
      )
      .describe("Exactly three rows, in order: building (building condition and major projects), finances (finances and reserves), insurance_legal (insurance, legal and governance)"),
  }),
  executive_summary: z
    .array(z.string())
    .describe(
      "Section 3. Two to four short paragraphs, about 220 words in total, in plain language: the overall financial and administrative position, significant capital expenditures against reserves, levies or funding shortfalls, material insurance, legal or building matters, and the important uncertainties. Not a repeat of the Top Findings list.",
    ),
  before_you_remove_subjects: z
    .array(z.object({ action: z.string().describe("A specific action, one sentence"), why: z.string().describe("Why, in one short clause"), ref: Ref }))
    .describe("Section 4. The 3 to 6 most important practical actions before removing subjects, most important first; only actions that arise from this review"),
  top_findings: z
    .array(
      z.object({
        title: z.string().describe("Short headline"),
        rating: Rating,
        text: z.string().describe("The issue and why it matters to the purchaser, 2 to 3 sentences"),
        pages: z.array(z.number()),
        ref: Ref.describe("The section with the detail"),
      }),
    )
    .describe("Section 5. The 4 to 7 most material findings, most serious first. A green finding belongs here only if it is materially reassuring."),
  figures: FiguresSchema,
  key_numbers_other: z
    .array(z.object({ label: z.string(), value: z.string().describe("As the documents give it, with its date"), pages: z.array(z.number()) }))
    .describe("Section 6. Up to 6 other key numbers not covered by figures, e.g. insurance premium, earthquake deductible, arrears, operating fund balance"),
  levies: z
    .array(
      z.object({
        period: z.string().describe("Short, under 50 characters, e.g. '2027 (depreciation report forecast)' or '2021 SGM: settlement levy'"),
        status: z.enum(["approved", "proposed", "forecast"]),
        strata_total: z.string().describe("Amount for the whole strata, as given, e.g. '$7,487,425'"),
        note: z.string().nullable().describe("e.g. 'paid in six instalments ending Dec 1, 2023'"),
        pages: z.array(z.number()),
      }),
    )
    .describe("Section 7. Special levies approved, proposed or forecast; the unit's share is calculated by the software from unit entitlement"),
  levy_comment: z
    .string()
    .describe("Section 7. Two to three sentences: what is approved versus only proposed or forecast, and anything that changes how levies would be shared (sections, forecast assumptions). If none were found, say so."),
  form_b: z
    .array(
      z.object({
        item: z.string(),
        answer: z.string(),
        rating: Rating.describe("amber or red if the answer needs follow-up, else green"),
        pages: z.array(z.number()),
      }),
    )
    .describe("Section 8. The Form B line by line; empty if there was no Form B"),
  red_flags: z
    .array(
      z.object({
        n: z.number().describe("The red flag's number, 1 to 20"),
        status: z.enum(["present", "partly", "not_shown", "not_checked"]),
        note: z.string().describe("One short sentence"),
        ref: Ref.nullable(),
      }),
    )
    .describe("Section 9. All 20 of the Condo Buyers Guide's Top 20 Red Flags, in order"),
  analysis: z
    .array(
      z.object({
        id: z.enum(ANALYSIS_IDS),
        reviewed: z.string().describe("One line: the documents reviewed for this section and their dates"),
        conclusion: z
          .string()
          .describe("One or two sentences: the practical conclusion for the purchaser, or that no material concerns were identified, or the limitation from missing documents"),
        items: z.array(Item).describe("The points that matter, most serious first; at most 8"),
      }),
    )
    .describe(
      "Sections 10 to 15, one entry for each id in order: financial (10), depreciation (11), minutes (12), bylaws (13), insurance (14), other (15: building condition reports, legal matters, title, parking, engineering and other documents, and Okanagan checks such as short-term rental rules, rental pools, wildfire, flood and bare land infrastructure)",
    ),
  financial_interpretation: z
    .string()
    .describe(
      "Section 10. What the reserve position, funding plan and fee, contribution, insurance and operating trends mean for this purchaser, 3 to 5 sentences. A large CRF is not automatically healthy: weigh it against the work ahead and its timing.",
    ),
  issues: z
    .array(
      z.object({
        issue: z.string(),
        first_recorded: z.string(),
        last_recorded: z.string(),
        status: z.enum(["open", "in_progress", "resolved", "unknown"]),
        status_note: z.string(),
        cost: z.string().nullable(),
        pages: z.array(z.number()),
      }),
    )
    .describe("Section 12. Recurring or unresolved matters across the minutes, most material first, at most 10"),
  conflicts: z.array(z.object({ what: z.string(), pages: z.array(z.number()) })).describe("Section 15. Where documents disagree"),
  documents_to_request: z.array(z.object({ document: z.string(), why: z.string() })).describe("Section 16. At most 8, most important first"),
  questions: z
    .array(z.string())
    .describe("Section 17. Specific follow-up questions for the strata manager or seller, at most 10, that do not repeat section 4"),
  service_signals: z
    .object({
      depreciation_report: z.enum(["current", "out_of_date", "not_found", "unknown"]),
      insurance_appraisal: z.enum(["current", "out_of_date", "not_found", "unknown"]),
    })
    .describe("Two status flags used for section 18 (related services)."),
});
/** The report as written, plus any automated-check problems that remained after the rewrite. */
export type Report = z.infer<typeof ReportSchema> & { qc_problems?: string[] };

const RATING_ORDER: Record<RatingValue, number> = { red: 0, amber: 1, green: 2 };
export const worstRating = (ratings: RatingValue[]): RatingValue | null =>
  ratings.length ? [...ratings].sort((a, b) => RATING_ORDER[a] - RATING_ORDER[b])[0] : null;
export const byRating = <T extends { rating: RatingValue }>(xs: T[]) => [...xs].sort((a, b) => RATING_ORDER[a.rating] - RATING_ORDER[b.rating]);

/** One line for admin emails and logs, e.g. "AMBER overall (Building: RED, Finances: AMBER, Insurance/legal: GREEN)". */
export function riskSummary(report: Report) {
  const name = { building: "Building", finances: "Finances", insurance_legal: "Insurance/legal" } as const;
  return `${report.overall.rating.toUpperCase()} overall (${report.overall.areas.map((r) => `${name[r.area]}: ${r.rating.toUpperCase()}`).join(", ")})`;
}

const SYSTEM = `You write the review report for Condo Wise Guys, a British Columbia service that reviews strata (condominium) documents for prospective purchasers before they remove subjects. The reviews are directed by Brian A. Hill, a real property appraiser and Certified Reserve Planner, so the report should read like his appraisal and depreciation report work: factual, restrained, analytical and practical. It is not a generic AI summary.

You receive the order, the list of documents in the package, and reviewers' notes for each group of documents. Turn them into the final report.

The report always has the same 21 sections, in this order:
${SECTION_TITLES.map((t, i) => `${i + 1}. ${t}`).join("\n")}
Never leave a section out. Where a section has no material findings, say briefly what was reviewed and that no material concerns were identified, or name the limitation from missing documents. Say each fact once in its best place and point to it elsewhere by section number ("see 11"); do not repeat the same finding in several sections without adding value.

Rules:
- Use only facts in the notes. Never invent numbers, dates, page references, quotations or building details. Keep the page numbers from the notes.
- Distinguish clearly between documented facts, your professional analysis, projections, assumptions and matters requiring confirmation.
- figures: copy each figure exactly from the notes as a plain number with its pages. Leave a figure null if the notes don't give it. Do not calculate per-lot amounts, ratios or unit shares yourself: the software calculates them from figures and shows its working. capital_forecast is the depreciation report's yearly forecast spending; fee_history is this lot's monthly fee by year.
- Keep forecasts and decisions apart. A depreciation report's funding model is the author's projection, not a strata decision or an approved levy: say "the report models / projects", name the assumptions that matter (the contribution it assumes against the current budget, draft status, cost estimate class), and keep "approved" for levies owners actually voted. Never predict a special levy as certain unless it has been approved; describe a projected shortfall as a projected shortfall.
- Date everything. Today's date is given. Report Form B figures as "reported on the Form B dated ...". Do not claim something is still pending unless the newest document says so, and then say "as of <that date>".
- When comparing results to budget, say whether the budget figure is year-to-date or full-year.
- BC law: Form B no longer asks about rentals (repealed November 24, 2022) and rental restriction bylaws other than for short-term rentals are void. Never list a rental disclosure, the Form B rental item, or a Form J as missing. The CRF minimum is 10% of the total amount budgeted to the operating fund; only say a contribution meets it when the notes show that base.
- Pages marked as scanned pages that could not be read are not blank: say they could not be read and must be checked by hand. Never conclude a document is missing if its pages may be among the unreadable ones. Where documents are incomplete, hard to read or inconsistent, say so.
- overall: rate each of the three areas by its most serious material matter, and the overall rating is the most serious of the three. Top findings rated red mean the overall rating is red.
- top_findings: only the most important findings. Do not overload the section.
- minutes: do not summarize every meeting; identify recurring patterns, unresolved matters and significant events.
- bylaws: focus on rentals, short-term rentals, pets, age restrictions, smoking, renovations, parking and storage, use restrictions and significant enforcement; explain their practical effect without reproducing them.
- insurance: name what the purchaser should confirm with their insurance broker. Do not give insurance advice or assume the purchaser's policy covers a strata deductible.
- legal: say what is documented and what remains unknown. Do not speculate about outcomes or give legal advice.
- documents_to_request: only from the not-found list, or where the notes clearly show something important is missing or out of date, with why it matters. Check package contents by what each document is, not what its file is called. A missing document does not mean there is a problem: describe it as not found in the documents provided, never as something the seller failed to provide.
- before_you_remove_subjects holds the most urgent actions; questions holds the detailed follow-up inquiries. They serve different purposes; do not repeat one in the other.
- Never tell the buyer whether to buy, walk away, negotiate, or what to offer. Never use the words "stop and think hard", "negotiate or protect yourself", "guarantee", "certify" or "safe". Describe risk, implications and the follow-up that is warranted.
- Writing style: professional plain English, Canadian spelling, short paragraphs. Write as an experienced real property professional, not as an AI assistant. Avoid repetition, excessive adjectives, alarmist language, boilerplate, long explanations of straightforward matters, unsupported conclusions, unnecessary jargon, disclaimers in the body, and phrases such as "the AI has determined". Explain strata terms briefly for a purchaser who is not an expert.
- Professional limits (a document review, not an appraisal, inspection, audit, legal opinion or insurance advice):
  - Never give an opinion of the unit's market value or say how a finding affects its value or price.
  - Present legal questions (bylaw validity, title, leases, disputes, holdbacks) as matters for a lawyer or notary; building condition and cause of damage as matters for an inspector or engineer; insurance coverage as a matter for an insurance broker. Do not state a cause, defect, legal effect or approval the documents do not establish.
  - Nobody visited or inspected the property and nothing was independently verified. Never state or imply that it was, that the building is structurally sound or code compliant, or that it is free of mould, moisture damage, asbestos or other hazards.
  - Be impartial: present reassuring and concerning findings with the same care, and do not recommend or criticize any contractor, manager, insurer or other business.
  - Never comment on the race, colour, religion, national or ethnic origin, sex, sexual orientation, gender identity, age, family status, disability or source of income of owners, residents, neighbours or the area. Do not name individual people; refer to units by number only when it matters.
- red_flags: one row per flag of the Condo Buyers Guide's Top 20 (listed below), in order. present = the documents show it in a serious form; partly = early signs or a question to settle; not_shown = the relevant documents were reviewed and do not show it; not_checked = the documents provided don't let you assess it. A flag that is present or partly should also appear as a rated item; give its section. For flag 20, use the buyer's notes; if they don't say how the buyer plans to live, use not_checked.
- service_signals: depreciation_report "current" if the newest report or update is within 5 years of today, "out_of_date" if older or overdue, "not_found" if none in the package (and the strata has 5 or more lots), else "unknown"; insurance_appraisal "current" if an appraisal or update is within 3 years, "out_of_date" if older or the notes suggest under-insurance, "not_found" if insurance documents give no appraisal date or basis, else "unknown".

${RATING_METHOD}

The Condo Buyers Guide's Top 20 Red Flags:
${TOP_RED_FLAGS.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;

export async function composeReport(opts: {
  orderId: string;
  submission: number;
  runSlug: string;
  order: OrderContext;
  segments: Segment[];
  reviews: { group: string; title: string; review: GroupReview }[];
  missing: string[];
  today: string;
  unreadablePages: string;
}): Promise<Report> {
  const notes = opts.reviews.map((r) => `<notes group="${r.group}" title="${r.title}">\n${JSON.stringify(r.review)}\n</notes>`).join("\n");
  const request = `<order>
Property: ${opts.order.property_address}
Unit: ${opts.order.unit_number || "not given"}
Strata plan: ${opts.order.strata_plan || "not given"}
${opts.order.notes ? `Buyer's notes: ${opts.order.notes}` : "Buyer's notes: none given"}
</order>

<package_contents>
${describeSegments(opts.segments)}
</package_contents>

<today>${opts.today}</today>

<unreadable_scanned_pages>
${opts.unreadablePages || "None"}
</unreadable_scanned_pages>

<not_found_in_package>
${opts.missing.length ? opts.missing.map((m) => `- ${m}`).join("\n") : "Nothing required appears to be missing."}
</not_found_in_package>

${notes}

Write the report.`;

  // The automated checks run on every draft. A draft that fails is rewritten once with the
  // problems listed; if the second draft still fails, it goes ahead and the problems are
  // shown to Brian with the draft (they never block a report on their own).
  let problems: string[] = [];
  let report: Report | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    report = await askForJson({
      orderId: opts.orderId,
      step: attempt === 1 ? "Write report" : "Rewrite report after checks",
      costKey: `claude:compose:${opts.orderId}:s${opts.submission}:${opts.runSlug}:std1:a${attempt}`,
      schema: ReportSchema,
      system: SYSTEM,
      effort: "high",
      content: [
        {
          type: "text",
          text:
            attempt === 1
              ? request
              : `${request}\n\nYour previous draft failed these automated checks. Write the whole report again, fixing them:\n${problems.map((p) => `- ${p}`).join("\n")}\n\nPrevious draft:\n${JSON.stringify(report)}`,
        },
      ],
    });
    problems = checkReport(report, notes, opts.missing);
    if (!problems.length) break;
  }
  return { ...report!, qc_problems: problems };
}
