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

/**
 * How every finding is prioritized. Dollar thresholds give the writer a testable rule, so
 * ordinary items stay routine instead of drifting to "moderate". Priorities describe how much
 * a finding matters; they never tell the buyer what to do (no purchase advice).
 */
export const PRIORITY_METHOD = `Give every finding a priority by how much it could matter to a buyer of this unit:
- high: a documented issue with a plausible cost to this lot of more than about $10,000 (estimate the lot's share by unit entitlement where you can); or a legal, insurance or ownership matter that could change whether the home suits the buyer (for example a large deductible that can be charged to the owner, an open lawsuit with material exposure, insurer conditions for renewal); or major work forecast with reserves far short of it.
- moderate: a plausible cost to this lot of about $2,000 to $10,000; a trend worth monitoring (rising fees, repeated overruns, recurring but contained leaks); or a material question the documents can't answer (a missing document that sets the scope or cost of upcoming work).
- routine: everything else: normal maintenance and repairs, administration, small disputes, rules, and reassuring findings. Routine is the normal case; most items in most packages are routine.
Do not inflate. Pest control, move-in fees, gym rules, quiet hours and similar items are routine. Lifestyle bylaws and rules (pets, smoking, rentals, business use, renovations needing approval) are not risks: report them as facts to check against the buyer's plans, rated routine, unless the buyer's notes say they conflict with how the buyer plans to live (then high) or the bylaw shifts costs to owners (deductible chargebacks, owner repair responsibility for windows, doors, balconies or pipes: rate by exposure).
Tag each finding's evidence: "documented" when a document states it, "interpretation" when it is your professional reading of what documented facts suggest. Word interpretations as such ("this suggests", "this is consistent with"), never as fact.`;

/** Labels used in the PDF. */
export const PRIORITY_LABEL: Record<"high" | "moderate" | "routine", string> = {
  high: "High",
  moderate: "Moderate",
  routine: "Routine",
};

/** The Top 20 Red Flags from the Condo Buyers Guide (Part 12.2), in the guide's order. Every report checks each one. */
export const TOP_RED_FLAGS = [
  "Special levy approved, with instalments due after your completion date",
  "Special levy, loan, or \"funding options\" under discussion in the minutes",
  "A failed 3/4 vote on a major repair",
  "No depreciation report, or one more than five years old",
  "Depreciation report shows the CRF going negative under current funding",
  "Actual CRF contributions far below the recommended amount",
  "Repeated water ingress reports from several units",
  "An engineering investigation of the envelope, balconies, parkade or structure",
  "Original face-sealed cladding on a 1980s to early 2000s coastal wood-frame building",
  "Poly-B, Kitec or failing copper piping without a plan",
  "Major components at or past the end of their life",
  "A water damage deductible much higher than your policy can cover",
  "A sharp jump in insurance premiums or deductibles, or insurer conditions for renewal",
  "Lawsuits, CRT disputes, arbitrations or judgments involving the strata",
  "Outstanding government work orders",
  "Operating deficits, large arrears, or a strata loan",
  "Engineering reports mentioned in the minutes but not provided",
  "Frequent manager or council turnover, or open conflict between owners and council",
  "Missing minutes or financial statements",
  "A bylaw that does not fit your plans for pets, renovations, short-term rental or business use",
] as const;

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
- For Form J or a rental disclosure, if present: record what it says.
- Red flags from the buyers guide (Part 5.3), each to be reported if present: a CRF balance that looks small for the size and age of the building; any approved special levy, especially with instalments due after the likely completion date; any lawsuit, arbitration, CRT dispute or outstanding work order; an alteration agreement attached to this strata lot; bylaw amendments or 3/4 resolutions not yet filed (say whether their text was provided); no depreciation report, or one more than five years old; parking or storage assigned by council licence or simple assignment rather than as limited common property or a separate strata lot; any answer of "unknown", "to be confirmed", or a blank where a yes or no is expected.`,
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
- Whether statements are audited, reviewed, or management-prepared, and the fiscal year end.
- Legal fees: the amount and whether it is growing from year to year.
- Repairs and maintenance against budget: large overruns often point to aging equipment or ongoing leaks.
- Insurance premium trend over two or three years, and whether it is rising much faster than inflation.
- CRF activity: contributions, spending, interest and closing balance. Does the closing balance agree with the Form B and the depreciation report? Any large unplanned withdrawals?
- Red flags from the buyers guide (Part 8.4), each to be reported if present: operating deficits in more than one year; large or growing legal fees; insurance costs rising much faster than inflation without an explanation; repairs and maintenance well over budget; CRF contributions below the depreciation report's recommendation, or at the 10% legal minimum in an older building; significant arrears, or one owner owing a large amount; a strata loan, or one being discussed; unaudited statements in a large building with large sums involved, or statements missing altogether.`,
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
- If the package also contains an older depreciation report, use the newest and say which is older.
- The five numbers from the buyers guide (Part 6.4): the current CRF balance, the recommended annual contribution, the actual annual contribution, the total projected expenditures for the next 10 years, and the lowest projected CRF balance and the year it occurs under the current funding. Report each as a fact.
- Building envelope type (for example rainscreen, face-sealed stucco, brick, curtain wall) and whether it has been remediated, the roof's age and remaining life, the piping material (copper, Poly-B, Kitec, galvanized, PEX), and the state of elevators, boilers and other major systems.
- Red flags from the buyers guide (Part 6.6), each to be reported if present: no report, an expired report, or one older than the five-year cycle with no update planned; the status quo scenario goes negative and owners have not adopted a higher contribution; the actual contribution well below the recommended one, year after year; major components (roof, envelope, windows, elevators, boilers, plumbing risers) at or past the end of their expected life; large "repair now" items in the condition assessment (failed sealants, balcony membrane failure, corroded piping, parkade slab deterioration); replacement costs that look stale, not updated for recent construction inflation; components missing from the inventory (for example no building envelope line in an older wood-frame building); council or owners rejecting the planner's recommendations without a plan of their own.`,
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
- Note the date range the minutes cover and any months that appear to be missing.
- Search for the buyers guide keywords (Appendix C): leak, water ingress, moisture, mould, flood, sump, backup; envelope, rainscreen, stucco, sealant, membrane, balcony, crack, spalling, rebar, settlement; roof, boiler, elevator, riser, Poly-B, Kitec, galvanized, pinhole, panel, fire alarm, sprinkler; special levy, loan, borrow, shortfall, deficit, arrears; claim, deductible, renewal, premium, appraisal; lawsuit, lawyer, CRT, tribunal, arbitration, lien, demand letter; complaint, harassment, noise, smoking, cannabis, Airbnb, short-term, fine; engineer, assessment, quote, tender, warranty.
- General meetings: resolutions that failed (especially a failed special levy or 3/4 vote on a major repair), whether owners approved the CRF contribution the depreciation report recommended or cut it, close or contested votes, owners' questions in new business, and meetings that failed to reach quorum.
- Track recurring issues across meetings: for each issue that appears in more than one meeting (a leak area, a project, a failing system, a dispute), record when it was first and last recorded, how many meetings mention it, its status at the last record (open, in progress, resolved or unknown), any cost given, and the pages. These go in the issues list, not as separate findings per meeting.
- List every engineering, consultant or condition report the minutes refer to (envelope, structural, roofing, elevator, mechanical, electrical, plumbing), with its date and subject, so the report can say whether it was provided.
- Red flags from the buyers guide (Part 7.5), each to be reported if present: repeated water ingress reports from different units; any engineering investigation of the envelope, balconies, parkade, plumbing or structure; a special levy or loan being discussed, drafted or "brought to owners"; a failed 3/4 vote on a major repair; insurance claims, especially repeated water claims, or insurer warnings about renewal; a sharp increase in premiums or deductibles; legal advice sought, demand letters, CRT claims or lawsuits; frequent turnover of council members or strata managers; unresolved conflict between council and owners, or between neighbours; gaps in the minutes, or minutes so brief they reveal nothing.`,
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
- Whether these appear to be the current consolidated bylaws filed at the Land Title Office, or the Standard Bylaws, and any recent amendments.
- Repair and maintenance responsibility: which parts of the building (windows, doors, balcony membranes, pipes) the bylaws make owners responsible for.
- Noise and quiet hours, occupancy limits, move-in fees, and fine amounts.
- Whether council rules have been ratified at a general meeting.
- Pets, smoking, rentals, business use and renovation approvals are facts for the buyer to check against their plans: report them as routine findings unless the buyer's notes conflict with them or they shift costs to owners.
- Red flags from the buyers guide (Part 9.4), each to be reported if present: a bylaw that conflicts with the buyer's stated plans (pets, renovations, home business, short-term rental income); bylaw amendments passed but not filed, or proposed for the next AGM; frequent fines or bylaw disputes; bylaws placing unusually broad repair or insurance responsibility on owners (windows, balcony membranes, pipes serving other units); outdated rental or age bylaws that the strata still tries to enforce.`,
  },
  {
    id: "insurance",
    title: "Insurance",
    types: ["insurance"],
    checks: `- Insurer, policy period, and whether the policy is current.
- Building coverage amount and whether it is full replacement value. Note the date of the last insurance appraisal.
- Deductibles for each peril, especially water damage, sewer backup, flood, and earthquake. Earthquake deductibles in BC are often a percentage of the loss.
- Liability coverage and directors and officers coverage.
- What this means for the buyer: the minimum condo (unit owner) insurance they should carry to cover deductibles that could be charged back to them.
- Named insured (the strata corporation and plan number) and the renewal date.
- Red flags from the buyers guide (Part 10.3), each to be reported if present: a water damage deductible far above what a typical unit owner policy covers (often $25,000 to $50,000 or more is hard to insure); a large jump in premiums or deductibles at the last renewal; insurer conditions for renewal, such as required repairs; many water claims in the last three years; no recent replacement cost appraisal, or a replacement value that looks low for the building; gaps in coverage, such as no earthquake or flood coverage; a bylaw making owners responsible for deductibles even when they were not at fault.`,
  },
  {
    id: "engineering",
    title: "Building condition and other reports",
    types: ["engineering_report", "electrical_planning_report"],
    checks: `- Deficiencies found, how urgent they are, and their estimated cost.
- Whether the strata acted on the recommendations.
- Electrical planning reports: BC requires most strata corporations with 5 or more lots to obtain one (Metro Vancouver and the Lower Mainland by December 31, 2026; the rest of BC by December 31, 2028). Note its findings on electrical capacity and EV charging, or that none was provided.
- Building envelope: evidence of moisture in wall assemblies, and whether the cladding is face-sealed stucco on a 1980s to early 2000s wood-frame building that has not been remediated.
- Roofs, balconies and parkades: membrane condition, balcony leaks or rot, parkade slab cracking, spalling or rebar corrosion.
- Plumbing: Poly-B, Kitec, galvanized or pinhole-prone copper piping, and any replacement plan.
- Mechanical, elevators and fire safety: systems past their expected life, and fire safety deficiencies carried over from one annual inspection to the next.
- Red flags from the buyers guide (Part 11.8), each to be reported if present: any report recommending major work without a funding plan; moisture in wall assemblies or unremediated face-sealed stucco on an older wood-frame building; Poly-B, Kitec or failing copper piping without a plan; parkade slab deterioration; elevators or boilers past their expected life with no replacement budget; fire safety deficiencies left uncorrected; an electrical planning report showing a service upgrade is required, with no funding plan.`,
  },
  {
    id: "other",
    title: "Legal matters, notices and other documents",
    types: ["legal", "correspondence", "other"],
    checks: `- Court or CRT actions, liens, judgments, or claims involving the strata or this unit: file numbers, parties, status, and whether the minutes record how they ended.
- Notices from the strata, the city, the fire department, or WorkSafeBC; work orders.
- Anything else a buyer should know before removing subjects.
- Okanagan and BC Interior matters, where the documents touch on them: short-term rental use (the provincial principal residence requirement applies unless the municipality has opted out for that zone or address; Kelowna exempts only listed short-term rental subzone properties from June 1, 2026), rental pool, hotel or resort management agreements, wildfire or flood risk, evacuation or smoke damage, insurer comments on wildfire, and the timing of the insurance renewal; for bare land stratas, who owns and maintains roads, water, sewer and septic systems and what reserves cover them. Report what the documents say; do not judge legality yourself.
- Ignore cover pages, blank pages, and marketing material.`,
  },
];

export function groupForType(type: DocType) {
  return REVIEW_GROUPS.find((g) => g.types.includes(type)) ?? REVIEW_GROUPS[REVIEW_GROUPS.length - 1];
}
