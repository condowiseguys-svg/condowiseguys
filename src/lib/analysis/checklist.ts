import type { PackageItemId } from "@/lib/ops/package-checklist";

/**
 * The kinds of document found in a BC strata disclosure package, and what to look for
 * in each. Edit the `checks` text to change what the report writer pays attention to.
 */
export const DOC_TYPES = [
  "form_b",
  "bylaws_rules",
  "minutes_council",
  "minutes_general",
  "financial_statements",
  "budget",
  "depreciation_report",
  "insurance",
  "strata_plan",
  "engineering_report",
  "electrical_planning_report",
  "form_j",
  "legal",
  "correspondence",
  "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  form_b: "Form B Information Certificate",
  bylaws_rules: "Bylaws and rules",
  minutes_council: "Council meeting minutes",
  minutes_general: "AGM / SGM minutes",
  financial_statements: "Financial statements",
  budget: "Budget",
  depreciation_report: "Depreciation report",
  insurance: "Insurance",
  strata_plan: "Strata plan",
  engineering_report: "Engineering or building condition report",
  electrical_planning_report: "Electrical planning report",
  form_j: "Rental disclosure (Form J)",
  legal: "Legal, CRT or court documents",
  correspondence: "Notices and correspondence",
  other: "Other",
};

/** Which required package item each document type satisfies. */
export const SATISFIES: Partial<Record<DocType, PackageItemId>> = {
  form_b: "form_b",
  bylaws_rules: "bylaws_rules",
  minutes_council: "minutes",
  minutes_general: "minutes",
  financial_statements: "financials",
  budget: "budget",
  depreciation_report: "depreciation_report",
  insurance: "insurance",
  strata_plan: "strata_plan",
  engineering_report: "engineering",
  electrical_planning_report: "electrical_planning",
  form_j: "form_j",
};

export type ReviewGroup = { id: string; title: string; types: DocType[]; checks: string };

/** Documents are reviewed in these groups, each with its own BC checklist. */
export const REVIEW_GROUPS: ReviewGroup[] = [
  {
    id: "form_b",
    title: "Form B and the strata lot",
    types: ["form_b", "form_j", "strata_plan"],
    checks: `- Go through the Form B line by line, using its own item numbers or letters: monthly strata fee for this lot, amounts the seller owes the strata, agreements to sell or lease common property, bylaw amendments not yet filed, resolutions passed by 3/4 vote not yet filed, any approved or proposed special levy (amount and this lot's share), any amounts the strata has committed to spend from the contingency reserve fund (CRF), CRF balance, court or Civil Resolution Tribunal (CRT) actions, notices or work orders from a government authority, parking and storage allocated to this lot, depreciation report on file, electrical planning report on file, age restrictions, and anything attached. The rental item was repealed on November 24, 2022 and Form J is no longer needed for a purchase decision: do not flag either as missing.
- If an item refers to an attachment (e.g. a Legal Disclosure), look for it in the package, including scanned pages, and say where it is.
- Note the date of the Form B. A Form B more than a few weeks old may be out of date.
- Find this strata lot's unit entitlement and the total unit entitlement of the strata (Schedule of Unit Entitlement or Form B attachments), so levies can be estimated for the lot. Report both numbers if found.
- Check that the strata plan, lot number and address match the order. Note whether the strata has sections (e.g. residential and commercial) and whether section records were provided.
- For Form J or a rental disclosure, if present: record what it says.`,
  },
  {
    id: "financial",
    title: "Financial health",
    types: ["financial_statements", "budget"],
    checks: `- Operating results: surplus or deficit for the year, and the main lines over or under budget.
- Strata fee changes: the increase from last year to this year, and any signs that a further increase is coming.
- Contingency reserve fund: balance, annual contribution, and whether the contribution matches the depreciation report's funding models. BC requires at least 10% of the total amount budgeted to the operating fund; state the base you compared against.
- When comparing actual results to budget, say whether the budget figure is year-to-date or full-year.
- Fee schedules list each strata lot's unit entitlement and the total unit entitlement (residential, commercial and combined). Report this lot's and the totals.
- Money moved from the CRF to cover operating costs, borrowing, or loans.
- Arrears: owners owing money, and any large receivables.
- Insurance premium and deductible trends shown in the budget.
- Special levy accounts and how much is left to collect or spend.
- Whether statements are audited, reviewed, or management-prepared, and the fiscal year end.`,
  },
  {
    id: "depreciation",
    title: "Depreciation report and major projects",
    types: ["depreciation_report"],
    checks: `- Date of the report and its author. In BC, most strata corporations with 5 or more lots must now get a depreciation report every 5 years and can no longer waive it. A report older than 5 years is stale; say so.
- Building age and type, and the main components near the end of their life (roof, building envelope, windows, balconies, piping, elevators, parkade membrane, mechanical and electrical).
- The funding scenarios: recommended annual CRF contribution vs what the strata actually contributes.
- Every major project forecast in the next 10 years with its year and cost, and any special levies the report expects. Give the yearly totals and the 10-year total.
- Whether the report says levies are likely or unavoidable under current funding, and the annual contribution the model assumes (compare it with the current budget if known).
- Whether the report is final or marked draft, and any conflicting dates.
- If the package also contains an older depreciation report, use the newest and say which is older.`,
  },
  {
    id: "minutes",
    title: "Meeting minutes",
    types: ["minutes_council", "minutes_general"],
    checks: `- Special levies: approved, voted down, proposed, or discussed, with amounts and dates.
- Major repairs and projects: building envelope, roof, windows, balconies, piping or plumbing replacement, elevators, parkade, boilers, fire safety, EV charging. Note cost estimates, contractors, and timing.
- Water leaks, floods, mould, and insurance claims, especially repeated ones or ones involving this unit or its stack.
- Insurance deductibles charged back to owners, and the strata's deductible amounts.
- Strata fee increases, operating deficits, or cash flow problems.
- Lawsuits, CRT disputes, liens, or disputes between owners, council and the property manager.
- Bylaw problems: noise, smoking, pets, short-term rentals, renovations without approval, fines.
- Governance: council resignations, failed quorums, property manager changes, owners unable to fill council.
- Warranty (2-5-10 home warranty) items and deadlines for newer buildings.
- Anything about this specific unit, its floor, or its stack.
- Fee schedules attached to AGM minutes list each strata lot's unit entitlement and the total unit entitlement. Report this lot's entitlement and the totals.
- Note the date range the minutes cover and any months that appear to be missing.`,
  },
  {
    id: "bylaws",
    title: "Bylaws and rules",
    types: ["bylaws_rules"],
    checks: `- Rentals: since November 2022, BC strata bylaws that prohibit or limit rentals have no effect (bylaws restricting short-term rentals under 30 days still apply). Report any short-term rental rules.
- Age: since November 2022, age restrictions other than 55+ have no effect. Report any 55+ restriction.
- Pets: limits on number, size, or type.
- Smoking and cannabis.
- Insurance deductible chargebacks: whether owners must pay the deductible when damage starts in their unit, and up to what amount.
- Renovation approvals (especially flooring, plumbing, and electrical), move-in fees, and fines.
- Use restrictions: home business, parking, storage, EV charging, barbecues, balconies.
- Whether these appear to be the current consolidated bylaws filed at the Land Title Office, or the Standard Bylaws, and any recent amendments.`,
  },
  {
    id: "insurance",
    title: "Insurance",
    types: ["insurance"],
    checks: `- Insurer, policy period, and whether the policy is current.
- Building coverage amount and whether it is full replacement value. Note the date of the last insurance appraisal.
- Deductibles for each peril, especially water damage, sewer backup, flood, and earthquake. Earthquake deductibles in BC are often a percentage of the loss.
- Liability coverage and directors and officers coverage.
- What this means for the buyer: the minimum condo (unit owner) insurance they should carry to cover deductibles that could be charged back to them.`,
  },
  {
    id: "engineering",
    title: "Building condition and other reports",
    types: ["engineering_report", "electrical_planning_report"],
    checks: `- Deficiencies found, how urgent they are, and their estimated cost.
- Whether the strata acted on the recommendations.
- Electrical planning reports: BC requires most strata corporations with 5 or more lots to obtain one (Metro Vancouver and the Lower Mainland by December 31, 2026; the rest of BC by December 31, 2028). Note its findings on electrical capacity and EV charging, or that none was provided.`,
  },
  {
    id: "other",
    title: "Legal matters, notices and other documents",
    types: ["legal", "correspondence", "other"],
    checks: `- Court or CRT actions, liens, judgments, or claims involving the strata or this unit: file numbers, parties, status, and whether the minutes record how they ended.
- Notices from the strata, the city, the fire department, or WorkSafeBC; work orders.
- Anything else a buyer should know before removing subjects.
- Ignore cover pages, blank pages, and marketing material.`,
  },
];

export function groupForType(type: DocType) {
  return REVIEW_GROUPS.find((g) => g.types.includes(type)) ?? REVIEW_GROUPS[REVIEW_GROUPS.length - 1];
}
