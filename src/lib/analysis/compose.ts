import { z } from "zod/v4";
import { askForJson } from "./claude";
import { RISK_METHOD, TOP_RED_FLAGS } from "./checklist";
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
  rating: Risk.describe(
    "Overall rating, traffic light method: red = stop and think hard (large costs or risks likely); amber = negotiate or protect yourself (concerns with costs that can be estimated); green = note and budget (no major concerns found)",
  ),
  rating_headline: z
    .string()
    .describe("A few words after the rating that do not overstate certainty, e.g. 'major capital work and substantial potential special levies'"),
  summary: z.string().describe("Executive summary, one paragraph of 3 to 5 sentences for the buyer"),
  priorities: z
    .array(z.string())
    .describe("Exactly 4 (fewer only if there is little to do) actions the buyer should take before removing subjects, most important first, one sentence each"),
  top_findings: z.array(Item).describe("The 4 to 7 most important findings, most important first, including at least one green item if any exist"),
  key_numbers: z
    .array(z.object({ label: z.string(), value: z.string(), pages: z.array(z.number()) }))
    .describe("Monthly strata fee, CRF balance, CRF contribution, special levies, deductibles, depreciation report date, etc."),
  levies: z
    .object({
      rows: z.array(
        z.object({
          period: z
            .string()
            .describe("Short, under 50 characters: when and what, e.g. '2027 (depreciation report forecast)' or '2021 SGM: One West settlement'"),
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
  red_flags: z
    .array(
      z.object({
        n: z.number().describe("The red flag's number, 1 to 20, as listed in the instructions"),
        status: z
          .enum(["red", "amber", "green", "not_checked"])
          .describe(
            "Scored like the guide's Red Flag Scorecard: red = the documents show this red flag in a serious form; amber = partly present, early signs, or a question to settle; green = the relevant documents were reviewed and do not show it; not_checked = the documents provided don't let you assess it (rows scored not_checked are left out of the report, so never use not_checked to signal a problem)",
          ),
        note: z.string().describe("One short sentence on what the documents show, with dates or amounts where useful"),
        pages: z.array(z.number()),
      }),
    )
    .describe("All 20 of the Condo Buyers Guide's Top 20 Red Flags, one row each, in order 1 to 20"),
  missing_documents: z.array(z.object({ document: z.string(), why_it_matters: z.string() })),
  questions: z.array(z.string()).describe("Questions to ask the strata manager or seller, most important first, at most 10"),
  service_signals: z
    .object({
      depreciation_report: z
        .enum(["current", "out_of_date", "not_found", "unknown"])
        .describe("State of the strata's depreciation report, by the rule in the instructions"),
      insurance_appraisal: z
        .enum(["current", "out_of_date", "not_found", "unknown"])
        .describe("State of the replacement cost (insurance) appraisal, by the rule in the instructions"),
    })
    .describe("Two status flags used to suggest related services at the end of the report. They are not shown to the buyer as findings."),
});
export type Report = z.infer<typeof ReportSchema>;

const SYSTEM = `You write the review report for Condo Wise Guys, a British Columbia service that reviews strata (condominium) documents for home buyers before they remove subjects.
You receive the order, the list of documents in the package, and reviewers' notes for each group of documents. Turn them into the final report.

Rules:
- Use only facts in the notes. Never invent numbers, dates, or page references. Keep the page numbers from the notes.
- When a special levy is forecast or approved for the whole strata and this lot's unit entitlement and the total unit entitlement are known (fee schedules usually list both), estimate this lot's share (amount x lot entitlement / total entitlement), round it ("about $10,900") and label it an illustration: the actual split depends on the levy resolution and, in sectioned stratas, on which section pays. Only if the entitlements are truly not in the notes, say "unknown" and ask for the lot's share.
- Keep forecasts and decisions apart. A depreciation report's funding model is a projection, not an approved levy: say "the report models / projects", name the assumptions that matter (e.g. the annual contribution it assumes vs the current budget, draft status, conflicting dates), and keep "approved" for levies owners actually voted.
- Date everything. Today's date is given. Report Form B figures as "reported on the Form B dated ...", and say how old key documents are on today's date. Do not claim something is still pending (e.g. a budget not yet approved) unless the newest document says so, and then say "as of <that document's date>". Recommend asking for updated documents where the package is stale.
- When comparing results to budget, say whether the budget figure is year-to-date or full-year.
- BC law: Form B no longer asks about rentals (repealed November 24, 2022) and rental restriction bylaws other than for short-term rentals are void. Never list a rental disclosure, the Form B rental item, or a Form J as missing. The contingency reserve fund minimum is 10% of the total amount budgeted to the operating fund; only say a contribution meets it when the notes show that base.
- Pages marked as scanned pages that could not be read are not blank: say they could not be read and must be checked by hand. Never conclude a document is missing if its pages may be among the unreadable ones.
- Say each fact once in its best place. The summary gives the picture, priorities say what to do, top findings give the evidence; sections add detail without repeating the top findings word for word.
- Rate overall with the same traffic light method: red ("stop and think hard") if the buyer is likely to face large costs or the home may not suit them (e.g. big special levies, underfunded reserves facing major work, serious unresolved building problems, litigation); amber ("negotiate or protect yourself") if there are concerns with costs that can be estimated or questions to settle; green ("note and budget") if no major concerns were found. Explain the rating in the summary, using those words.
- red_flags: go through the Condo Buyers Guide's Top 20 Red Flags (listed below) one by one, using only the notes. Give one row for each, in order, scored red, amber, green or not_checked. A flag scored red or amber should also appear as a finding elsewhere in the report with a matching rating. For flag 1, compare instalment dates with the buyer's completion date if it is known; otherwise score any approved levy with instalments still to come as red and say to check the dates. For flag 9, use the building's age, construction and cladding from the notes; green if the building is not wood-frame, was built outside that era, or has been remediated. For flag 12, a water damage deductible above about $25,000 is amber and above about $50,000 is red unless the notes say otherwise. For flag 17, compare the reports the minutes mention with the package contents. For flag 20, use the buyer's notes; if they don't say how the buyer plans to live, score amber where the bylaws restrict pets, renovations, short-term rentals or business use, and say what to check.
- Write plainly for a buyer who is not an expert, in Canadian English. Be specific, balanced and calm. No legal advice; suggest asking a lawyer or inspector where appropriate.
- Professional limits (this report is a document review signed by an appraiser, not an appraisal):
  - Never give an opinion of the unit's market value, say what it is worth or what to offer, or say by how much a finding raises or lowers its value or price. Saying a finding is worth raising with the buyer's lawyer or realtor (for example a holdback or who pays a levy) is fine.
  - Stay within a document review. Present legal questions (bylaw validity, title, leases, disputes) as matters for a lawyer or notary, building condition and cause of damage as matters for an inspector or engineer, and insurance coverage as a matter for the buyer's insurance agent or broker. Do not state a cause, defect, legal effect or approval the documents do not establish.
  - Be impartial: present good and bad findings with the same care, and do not recommend or criticize any contractor, manager, insurer or other business.
  - Never comment on the race, colour, religion, national or ethnic origin, sex, sexual orientation, gender identity, age, family status, disability or source of income of owners, residents, neighbours or the area, and never use such characteristics in a finding or rating. Name an owner or resident only by unit number and only when it matters (for example a dispute the strata is party to).
- Fill every section; if nothing relevant was provided for a section, say so in its intro and leave items empty.
- List missing documents only from the list you are given or where the notes clearly show something important is missing or out of date. Before listing one, check the package contents and the notes by what each document is, not what its file is called: documents are often named differently. Describe each as not found in the documents provided, never as something the client or seller failed to provide.
- service_signals, using only the notes and today's date:
  - depreciation_report: "current" if the newest depreciation report (or update) is dated within 5 years of today; "out_of_date" if it is older than 5 years, or the notes say an update is overdue; "not_found" if the package has no depreciation report and the notes don't show the strata has fewer than 5 lots; "unknown" if you can't tell.
  - insurance_appraisal: "current" if the notes show a replacement cost (insurance) appraisal or appraisal update dated within 3 years of today; "out_of_date" if the newest one is older than 3 years, or the notes say the building may be under-insured; "not_found" if the package has insurance documents but no appraisal date or value basis; "unknown" if there is nothing to go on.

${RISK_METHOD}

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

<today>${opts.today}</today>

<unreadable_scanned_pages>
${opts.unreadablePages || "None"}
</unreadable_scanned_pages>

<not_found_in_package>
${opts.missing.length ? opts.missing.map((m) => `- ${m}`).join("\n") : "Nothing required appears to be missing."}
</not_found_in_package>

${notes}

Write the report. Section ids: financial, depreciation, minutes, bylaws, insurance, other (one of each, in that order).`,
      },
    ],
  });
}
