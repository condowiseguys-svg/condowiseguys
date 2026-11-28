import { z } from "zod/v4";
import { askForJson } from "./claude";
import { PRIORITY_METHOD, TOP_RED_FLAGS } from "./checklist";
import type { Segment } from "./classify";
import { FiguresSchema } from "./derive";
import { checkReport } from "./qc";
import { describeSegments, type GroupReview, type OrderContext } from "./review";

const Priority = z.enum(["high", "moderate", "routine"]);
const Evidence = z.enum(["documented", "interpretation"]);

/** Areas of section 3 (key findings), in report order. */
export const AREA_IDS = ["building", "capital", "insurance", "legal", "governance", "bylaws", "other"] as const;
export const AREA_TITLES: Record<(typeof AREA_IDS)[number], string> = {
  building: "Building condition and maintenance",
  capital: "Major capital projects",
  insurance: "Insurance",
  legal: "Legal and litigation",
  governance: "Governance and management",
  bylaws: "Bylaws and ownership restrictions",
  other: "Other matters",
};

/** Detailed sections (section 6), in report order. Numbers are fixed so the summary can point to them. */
export const DETAIL_IDS = ["depreciation", "minutes", "financial", "insurance", "bylaws", "legal", "engineering", "regional"] as const;
export const DETAIL_TITLES: Record<(typeof DETAIL_IDS)[number], string> = {
  depreciation: "Depreciation report and capital plan",
  minutes: "Meeting minutes",
  financial: "Financial statements and budget",
  insurance: "Insurance",
  bylaws: "Bylaws and rules",
  legal: "Title, sections, parking and legal matters",
  engineering: "Engineering and other reports",
  regional: "Okanagan and regional checks",
};
export const detailRef = (id: (typeof DETAIL_IDS)[number]) => `6.${DETAIL_IDS.indexOf(id) + 1}`;
export const areaRef = (id: (typeof AREA_IDS)[number]) => `3.${AREA_IDS.indexOf(id) + 1}`;

const Ref = z
  .string()
  .describe("Where the detail is: a section number such as '3.1', '4' (financial analysis), '5' (before you remove subjects) or '6.2'");

export const ReportSchema = z.object({
  snapshot: z.object({
    building: z.string().describe("Building or complex name and type, e.g. 'Landmark 33 tower, Marina Pointe' or 'Three-storey wood-frame low-rise'"),
    construction: z.string().describe("Construction and envelope, and year built, e.g. 'Concrete with rainscreen walls, completed about 1998'; 'unknown' parts said so"),
    lots: z.string().describe("e.g. '535 lots (530 residential, 5 commercial), sectioned strata'"),
    management: z.string().describe("'Professionally managed' or 'Self-managed'; do not name individual managers"),
    depreciation_report: z.string().describe("Author and date of the newest depreciation report, or 'none in package'"),
    newest_document: z.string().describe("The newest dated document in the package and its date, e.g. 'council minutes April 14, 2026'"),
    newest_document_age: z.string().describe("Its age on today's date, e.g. '7 months old'"),
  }),
  risk_profile: z
    .array(
      z.object({
        area: z.enum(["building", "finances", "insurance_legal"]),
        level: z.enum(["high", "moderate", "low"]),
        why: z.string().describe("One or two sentences with the deciding facts and figures"),
        refs: z.array(Ref),
      }),
    )
    .describe("Exactly three rows, in order: building (building condition and capital plans), finances (finances and reserves), insurance_legal (insurance, legal and governance)"),
  top_issues: z
    .array(z.object({ text: z.string().describe("One sentence"), ref: Ref }))
    .describe("The 3 to 5 issues that matter most to this buyer, most important first; only high or moderate matters"),
  summary: z.object({
    picture: z.string().describe("Paragraph 1: the overall picture of the building, its condition, finances and management, and the main issue, about 90 words"),
    second_tier: z.string().describe("Paragraph 2: the other material issues, then the genuine positives, about 70 words"),
    unknowns: z.string().describe("Paragraph 3: what the documents can't tell us that matters, in one or two sentences"),
  }),
  findings: z
    .array(
      z.object({
        area: z.enum(AREA_IDS),
        priority: z.enum(["high", "moderate"]),
        title: z.string().describe("Short headline"),
        shows: z.string().describe("What the documents show: facts only, with dates and amounts, 1 to 3 sentences"),
        why_it_matters: z.string().nullable().describe("Interpretation for this buyer, worded as interpretation; null if the facts speak for themselves"),
        ask: z.string().describe("Who to ask and what, in one sentence"),
        pages: z.array(z.number()),
        detail: Ref.nullable(),
      }),
    )
    .describe("Key findings: high and moderate items only, grouped by area. Routine items never go here."),
  figures: FiguresSchema,
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
    .describe("Special levies approved, proposed or forecast; the unit's share is calculated by the software from unit entitlement"),
  levy_basis_note: z
    .string()
    .nullable()
    .describe("Anything that changes how levies would be shared, e.g. sections, or the assumptions of the forecast model; null if none"),
  financial: z.object({
    reserve_interpretation: z
      .string()
      .describe("What the reserve position and funding plan mean for this buyer, 2 to 4 sentences; no verdict that the CRF is adequate or inadequate, explain the basis"),
    trend_interpretation: z.string().describe("What the fee, contribution, insurance and operating trends suggest, 1 to 3 sentences"),
    other_items: z
      .array(z.object({ text: z.string(), priority: Priority, evidence: Evidence, pages: z.array(z.number()) }))
      .describe("Operating fund, cash, inter-fund loans, arrears, strata loans, the CRF minimum test, budget variances over 10%"),
  }),
  details: z
    .array(
      z.object({
        id: z.enum(DETAIL_IDS),
        reviewed: z.string().describe("One line: what was reviewed and the date range"),
        items: z.array(z.object({ text: z.string(), priority: Priority, evidence: Evidence, pages: z.array(z.number()) })),
        routine_summary: z.string().nullable().describe("One sentence summarizing routine matters not listed as items"),
      }),
    )
    .describe("One entry per detail section, in order; an area the package didn't cover says so in reviewed and has no items"),
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
    .describe("Issue tracker for the minutes: recurring issues, most material first, at most 10"),
  lifestyle_checks: z
    .array(z.object({ text: z.string(), pages: z.array(z.number()) }))
    .describe("Bylaws and rules to check against the buyer's plans (pets, smoking, rentals, business use, renovations), unrated"),
  conflicts: z.array(z.object({ what: z.string(), pages: z.array(z.number()) })),
  documents_to_request: z.array(z.object({ document: z.string(), why: z.string() })).describe("At most 8, most important first"),
  questions: z.array(z.string()).describe("Questions for the strata manager, at most 8, most important first, each answerable"),
  who_to_ask: z
    .array(z.object({ who: z.enum(["lawyer or notary", "home inspector or engineer", "insurance broker", "mortgage lender", "realtor"]), about: z.string() }))
    .describe("What to take to which professional, based on this package's findings"),
  form_b: z
    .array(z.object({ item: z.string(), answer: z.string(), follow_up: z.boolean().describe("true if the answer needs follow-up"), pages: z.array(z.number()) }))
    .describe("Form B line by line; empty if there was no Form B"),
  red_flags: z
    .array(
      z.object({
        n: z.number().describe("The red flag's number, 1 to 20"),
        status: z.enum(["present", "partly", "not_shown", "not_checked"]),
        note: z.string().describe("One short sentence"),
        ref: Ref.nullable(),
      }),
    )
    .describe("All 20 of the Condo Buyers Guide's Top 20 Red Flags, in order"),
  service_signals: z
    .object({
      depreciation_report: z.enum(["current", "out_of_date", "not_found", "unknown"]),
      insurance_appraisal: z.enum(["current", "out_of_date", "not_found", "unknown"]),
    })
    .describe("Two status flags used for the delivery email. They are not shown in the report."),
});
/** The report as written, plus any automated-check problems that remained after the rewrite. */
export type Report = z.infer<typeof ReportSchema> & { qc_problems?: string[] };

/** One line for admin emails and logs, e.g. "Building: high, Finances: high, Insurance/legal: moderate". */
export function riskSummary(report: Report) {
  const name = { building: "Building", finances: "Finances", insurance_legal: "Insurance/legal" } as const;
  return report.risk_profile.map((r) => `${name[r.area]}: ${r.level}`).join(", ");
}

const SYSTEM = `You write the review report for Condo Wise Guys, a British Columbia service that reviews strata (condominium) documents for home buyers before they remove subjects. The reviewer is a Certified Reserve Planner, so the report is strongest on what the depreciation report, reserves and budgets mean for this buyer.

You receive the order, the list of documents in the package, and reviewers' notes for each group of documents. Turn them into the final report.

How the report reads: like a professional depreciation report. Highlights first (snapshot, risk profile, top issues, summary, key findings), then the financial analysis, then what to do before removing subjects, then detail sections and appendices. Say each fact once in its best place and point to it elsewhere by section number ("see 6.2"). The highlights must be short; the detail sections keep the full substance.

Section numbers you may refer to: 3.1 building condition, 3.2 major capital projects, 3.3 insurance, 3.4 legal, 3.5 governance, 3.6 bylaws, 3.7 other; 4 financial and capital planning; 5 before you remove subjects; 6.1 depreciation report, 6.2 minutes, 6.3 financial statements and budget, 6.4 insurance, 6.5 bylaws and rules, 6.6 title, sections, parking and legal, 6.7 engineering and other reports, 6.8 Okanagan and regional checks.

Rules:
- Use only facts in the notes. Never invent numbers, dates, or page references. Keep the page numbers from the notes.
- figures: copy each figure exactly from the notes as a plain number with its pages. Leave a figure null if the notes don't give it. Do not calculate per-lot amounts, ratios or unit shares yourself: the software calculates them from figures and shows its working. capital_forecast is the depreciation report's yearly forecast spending; fee_history is this lot's monthly fee by year.
- Keep forecasts and decisions apart. A depreciation report's funding model is a projection, not an approved levy: say "the report models / projects", name the assumptions that matter (the contribution it assumes against the current budget, draft status, cost estimate class), and keep "approved" for levies owners actually voted.
- Date everything. Today's date is given. Report Form B figures as "reported on the Form B dated ...". Say how old the newest documents are. Do not claim something is still pending unless the newest document says so, and then say "as of <that date>".
- When comparing results to budget, say whether the budget figure is year-to-date or full-year.
- BC law: Form B no longer asks about rentals (repealed November 24, 2022) and rental restriction bylaws other than for short-term rentals are void. Never list a rental disclosure, the Form B rental item, or a Form J as missing. The CRF minimum is 10% of the total amount budgeted to the operating fund; only say a contribution meets it when the notes show that base.
- Pages marked as scanned pages that could not be read are not blank: say they could not be read and must be checked by hand. Never conclude a document is missing if its pages may be among the unreadable ones.
- Risk profile levels: high = at least one high-priority matter in that area with real cost or suitability consequences; moderate = moderate matters but no high; low = only routine matters. Never inflate; say what would change the level.
- top_issues and findings contain only high and moderate matters. Routine matters appear only in details, mostly through routine_summary. Expect most packages to have 3 to 12 findings in total.
- Never tell the buyer whether to buy, walk away, negotiate, or what to offer. Never use the words "stop and think hard", "negotiate or protect yourself", "red flag" as a verdict, "guarantee", "certify" or "safe". Describe risk, implications and the follow-up that is warranted.
- Write plainly for a buyer who is not an expert, in Canadian English. Be specific, balanced and calm.
- Professional limits (a document review, not an appraisal, inspection, legal opinion or insurance advice):
  - Never give an opinion of the unit's market value or say how a finding affects its value or price. Saying a matter is worth raising with the buyer's lawyer or realtor is fine.
  - Present legal questions (bylaw validity, title, leases, disputes, holdbacks) as matters for a lawyer or notary; building condition and cause of damage as matters for an inspector or engineer; insurance coverage as a matter for an insurance broker. Do not state a cause, defect, legal effect or approval the documents do not establish. Do not tell the buyer to buy a particular insurance product: say what to ask the broker.
  - This is a review of documents only: nobody visited or inspected the property. Never state or imply that the building or unit was inspected, that it is structurally sound or code compliant, or that it is free of mould, moisture damage, asbestos or other hazards.
  - Be impartial: present good and bad findings with the same care, and do not recommend or criticize any contractor, manager, insurer or other business.
  - Never comment on the race, colour, religion, national or ethnic origin, sex, sexual orientation, gender identity, age, family status, disability or source of income of owners, residents, neighbours or the area. Do not name individual people (owners, managers, council members); refer to units by number only when it matters.
- Lifestyle bylaws (pets, smoking, rentals, business use, renovation approvals) go in lifestyle_checks, unrated, unless the buyer's notes say they conflict with the buyer's plans (then a high finding in 3.6) or the bylaw shifts costs to owners (rate by exposure).
- details: fill every detail section; if nothing relevant was provided, say so in reviewed and leave items empty. regional (6.8) covers short-term rental use, rental pool or hotel agreements, wildfire or flood, and bare land infrastructure where the documents touch on them; otherwise say the documents raise no regional matters.
- documents_to_request: only from the not-found list, or where the notes clearly show something important is missing or out of date. Check package contents by what each document is, not what its file is called. Describe each as not found in the documents provided, never as something the seller failed to provide.
- red_flags: one row per flag of the Condo Buyers Guide's Top 20 (listed below), in order. present = the documents show it in a serious form; partly = early signs or a question to settle; not_shown = the relevant documents were reviewed and do not show it; not_checked = the documents provided don't let you assess it. A flag that is present or partly should also be a finding or detail item; give its ref. For flag 20, use the buyer's notes; if they don't say how the buyer plans to live, use not_checked and rely on lifestyle_checks.
- service_signals: depreciation_report "current" if the newest report or update is within 5 years of today, "out_of_date" if older or overdue, "not_found" if none in the package (and the strata has 5 or more lots), else "unknown"; insurance_appraisal "current" if an appraisal or update is within 3 years, "out_of_date" if older or the notes suggest under-insurance, "not_found" if insurance documents give no appraisal date or basis, else "unknown".

${PRIORITY_METHOD}

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
      costKey: `claude:compose:${opts.orderId}:s${opts.submission}:${opts.runSlug}:a${attempt}`,
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
    problems = checkReport(report, notes);
    if (!problems.length) break;
  }
  return { ...report!, qc_problems: problems };
}
