/**
 * Local check of the report writer's non-Claude parts: reads a PDF's text layer, finds the
 * scanned pages, and draws a sample report from a fixed set of findings (taken from the
 * November 2026 Expo Blvd test report; the yearly split of the capital forecast and the
 * Progressive contribution are approximations), so layout changes can be checked without Claude.
 *   npx tsx scripts/render-sample.mts <package.pdf> <out.pdf>
 *   SAMPLE_TIER=standard  draws the Standard version (default: expert)
 *   SAMPLE_UNREVIEWED=1   draws a Standard report sent without Brian's release check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { needsOcr, pdfPageTexts } from "@/lib/analysis/extract";
import { makeCiter, numberPages } from "@/lib/analysis/pages";
import { renderReportPdf } from "@/lib/analysis/render-pdf";
import type { Report } from "@/lib/analysis/compose";
import type { Segment } from "@/lib/analysis/classify";

const [input, output] = process.argv.slice(2);
const bytes = new Uint8Array(readFileSync(input));
const texts = await pdfPageTexts(bytes);
const pages = numberPages([texts.map((text, i) => ({ doc: 0, page: i + 1, text, source: needsOcr(text) ? ("unreadable" as const) : ("text" as const) }))]);
console.log(`${pages.length} pages, ${pages.filter((p) => p.source !== "text").length} need OCR`);

const manifest = [{ document_id: "x", file_name: "package.pdf", storage_path: "x", sha256: "x", size_bytes: bytes.length, page_count: pages.length }];
const seg = (start: number, end: number, type: Segment["type"], title: string, date: string | null = null, superseded = false): Segment => ({ start, end, type, title, date, superseded });
const segments: Segment[] = [
  seg(2, 4, "form_b", "Form B Information Certificate", "2026-05-27"),
  seg(5, 10, "legal", "Civil Resolution Tribunal Dispute Notice ST-2024-012875"),
  seg(11, 14, "budget", "Approved annual budget May 1, 2025 to April 30, 2026"),
  seg(15, 58, "bylaws_rules", "Marina Pointe bylaws, revised July 15, 2025"),
  seg(59, 160, "strata_plan", "Strata Plan LMS2995"),
  seg(161, 233, "minutes_council", "Council meeting minutes, May 2025 to April 14, 2026"),
  seg(234, 306, "minutes_council", "Council meeting minutes, June 2025 to April 2026 (duplicate copy)"),
  seg(307, 375, "minutes_council", "Council meeting minutes, May 2024 to April 2025"),
  seg(376, 379, "minutes_general", "Joint Section SGM minutes, August 12, 2021"),
  seg(395, 401, "financial_statements", "Financial statements, March 2026"),
  seg(402, 405, "insurance", "Insurance summary of coverages"),
  seg(406, 560, "depreciation_report", "RDH Depreciation Report Update", "2025-10-31"),
  seg(561, 571, "engineering_report", "RDH BECA Appendix E - Preliminary cost estimates"),
  seg(582, 683, "depreciation_report", "2012 Depreciation Report, RDH", "2012-12", true),
  seg(684, 706, "minutes_general", "Annual General Meeting minutes, July 15, 2025, with 2025/26 budget"),
  seg(707, 724, "minutes_general", "Annual General Meeting minutes, July 17, 2024, with 2024/25 budget"),
  seg(725, 735, "bylaws_rules", "Marina Pointe Rules, revised June 10, 2025"),
];

const report: Report = {
  snapshot: {
    building: "Landmark 33 tower, Marina Pointe",
    construction: "Concrete with rainscreen walls, completed about 1998",
    lots: "535 lots (530 residential, 5 commercial), sectioned strata",
    management: "Professionally managed",
    depreciation_report: "RDH update, October 31, 2025",
    newest_document: "council minutes April 14, 2026",
    newest_document_age: "7 months old",
  },
  risk_profile: [
    {
      area: "building",
      level: "high",
      why: "About $33.8 million of roof, podium, wall, piping and elevator renewals are forecast for 2026 to 2028, membrane leaks recur, and key engineering reports are not in the package.",
      refs: ["3.2", "6.1"],
    },
    {
      area: "finances",
      level: "high",
      why: "Reserves are small next to the work ahead, the contribution is below every funding scenario in the depreciation report, and the operating fund was in deficit.",
      refs: ["4"],
    },
    {
      area: "insurance_legal",
      level: "moderate",
      why: "A $75,000 water damage deductible can be charged to an owner with no cap, and the Form B refers to legal proceedings whose disclosure is missing. Management and council are stable.",
      refs: ["3.3", "3.4"],
    },
  ],
  top_issues: [
    { text: "Large renewals are due now and reserves can't fund them: the depreciation report projects special levies or steep fee increases.", ref: "4.2" },
    { text: "The package stops in April 2026; the 2026 AGM, budget and any levy vote since are unknown.", ref: "5.1" },
    { text: "Membrane leaks recur across the complex, and the engineering findings on whether they are systemic are not provided.", ref: "3.1" },
    { text: "The $75,000 water damage deductible can be charged to an owner whose unit causes a loss.", ref: "3.3" },
    { text: "Parking stall 451 is held by lease assignment, and the strata won't warrant it without the original agreement.", ref: "6.6" },
  ],
  summary: {
    picture:
      "Landmark 33 is a well-built concrete tower in a large, professionally managed complex. Its main challenge is money, not management. Most original roofs, podium and deck membranes, walls, piping and elevators reach the end of their life together, and the October 2025 depreciation report forecasts about $33.8 million of work in 2026 to 2028. The reserve fund cannot pay for it, so the report projects special levies under current funding; if owners instead adopt higher contributions, fees would rise sharply.",
    second_tier:
      "Separately, the 2025/26 operating year was running a deficit, membrane leaks recur across the complex, and the $75,000 water deductible can be charged to an owner. In the building's favour: concrete rainscreen construction, a current depreciation report and insurance appraisal, broad coverage, stable management, and no work orders or arrears for this lot.",
    unknowns:
      "Whether a levy or fee increase was approved after April 2026, what the engineers concluded about the leaks, and whether this lot pays section fees on top of the strata fee.",
  },
  findings: [
    {
      area: "building",
      priority: "high",
      title: "Membrane leaks are recurring across the complex",
      shows:
        "Council minutes from May 2024 to April 2026 record leaks through patio, planter and roof membranes into at least 11 strata lots and several common areas. In March 2026 council asked BMAC Engineering whether the leaks are systemic; the answer is not in the package.",
      why_it_matters:
        "Repeated leaks from the same assemblies suggest the membranes are failing as a system rather than at isolated points, which is consistent with the depreciation report's forecast replacement in 2026 to 2028.",
      ask: "The strata manager, for BMAC's findings and EXP's peer review of the 2022 enclosure assessment; consider having an engineer explain them.",
      pages: [164, 171, 191, 216],
      detail: "6.2",
    },
    {
      area: "capital",
      priority: "high",
      title: "About $33.8 million of renewals forecast for 2026 to 2028",
      shows:
        "The RDH update forecasts roof and deck membranes (about $5.9 million), the podium membrane ($6.9 million, 2027), EIFS walls ($3.2 million, 2028), re-piping (about $7.3 million, 2026 to 2027) and elevator modernization. Costs are Class D estimates (plus or minus 50%) that mostly exclude soft costs.",
      why_it_matters: "Actual costs could be noticeably higher than forecast, and pending studies (podium, piping tests, enclosure update) could change timing.",
      ask: "The strata manager, for the current plan, timing and funding of each project, and whether the October 2025 report is final.",
      pages: [418, 419, 427, 445, 465],
      detail: "6.1",
    },
    {
      area: "insurance",
      priority: "high",
      title: "A $75,000 water damage deductible can be charged to the owner",
      shows:
        "Water damage and sewer backup deductibles are $75,000 each (policy May 1, 2026 to May 1, 2027). The bylaws let the strata charge the deductible to an owner whose unit causes a loss, with no cap.",
      why_it_matters: null,
      ask: "Your insurance broker, whether your unit owner policy would cover a $75,000 deductible assessment, and earthquake loss assessment cover.",
      pages: [39, 40, 403],
      detail: "6.4",
    },
    {
      area: "legal",
      priority: "moderate",
      title: "Form B says legal proceedings exist, but its disclosure is missing",
      shows: "The Form B answers yes to court, arbitration or tribunal proceedings and refers to an attached Legal Disclosure that is not in the package. The only matter found, a $300 CRT fine dispute, was withdrawn in October 2025.",
      why_it_matters: null,
      ask: "Your lawyer or notary, to obtain the Legal Disclosure and confirm what is open now.",
      pages: [3, 10, 202],
      detail: "6.6",
    },
    {
      area: "governance",
      priority: "moderate",
      title: "Low owner engagement",
      shows: "Both the 2024 and 2025 AGMs missed quorum at the start, and in 2025 only two people ran for two council seats.",
      why_it_matters: "Large levy votes need a 3/4 majority; low engagement can delay decisions on the 2026 to 2028 work.",
      ask: "The strata manager, how the 2026 AGM went and what was voted.",
      pages: [686, 702, 705],
      detail: "6.2",
    },
  ],
  figures: {
    lots_total: 535,
    lot_entitlement: 28,
    total_entitlement: 19193,
    monthly_fee: { amount: 266.13, as_of: "2025/26 fee, Form B dated May 27, 2026", pages: [3, 698] },
    monthly_fee_crf_part: 24.19,
    crf_balance: { amount: 2082521, as_of: "March 31, 2026", pages: [396, 397] },
    annual_crf_contribution: { amount: 199005, as_of: "2025/26 budget", pages: [12] },
    recommended_contribution: { amount: 3595200, scenario: "Progressive", pages: [427, 428] },
    capital_forecast: [
      { year: 2026, amount: 9800000, pages: [429] },
      { year: 2027, amount: 16200000, pages: [429] },
      { year: 2028, amount: 7800000, pages: [429] },
      { year: 2029, amount: 900000, pages: [429] },
      { year: 2030, amount: 700000, pages: [429] },
      { year: 2031, amount: 800000, pages: [429] },
      { year: 2032, amount: 2400000, pages: [429] },
      { year: 2033, amount: 600000, pages: [429] },
      { year: 2034, amount: 669000, pages: [429] },
    ],
    fee_history: [
      { year: "2023/24", monthly_fee: 255.67, pages: [721] },
      { year: "2024/25", monthly_fee: 298.83, pages: [721] },
      { year: "2025/26", monthly_fee: 266.13, pages: [698] },
    ],
    operating_result: { amount: -157215, period: "11 months to March 31, 2026", pages: [396, 400] },
    water_deductible: { amount: 75000, as_of: "policy May 1, 2026 to May 1, 2027", pages: [403] },
  },
  levies: [
    { period: "2021 SGM: settlement levy", status: "approved", strata_total: "$1,000,000", note: "paid in six instalments ending Dec 1, 2023", pages: [378] },
    { period: "2026 (depreciation report forecast)", status: "forecast", strata_total: "$7,487,425", note: null, pages: [429, 545] },
    { period: "2027 (depreciation report forecast)", status: "forecast", strata_total: "$17,451,879", note: null, pages: [429, 545] },
    { period: "2028 (depreciation report forecast)", status: "forecast", strata_total: "$7,922,261", note: null, pages: [429, 545] },
  ],
  levy_basis_note:
    "In this sectioned strata the share also depends on which section pays; a residential-only cost would be about 3.6% higher. The forecast assumes contributions stay at $223,462 a year; the 2025/26 budget is $199,005.",
  financial: {
    reserve_interpretation:
      "The strata is paying for its capital plan through special levies rather than reserves. That is a funding choice owners make at each AGM, not a fixed outcome: the realistic paths are large levies soon, a large permanent fee increase, or a mix. The 'Progressive' figure in the report is partly garbled, so confirm it before relying on the fee estimate.",
    trend_interpretation:
      "The 2025/26 fee fell because insurance costs fell, while the CRF contribution was cut and operating costs ran over budget. That combination usually leads to a catch-up increase; the 2026/27 budget that would confirm it is not in the package.",
    other_items: [
      {
        text: "The operating fund owed the CRF $271,982 at March 31, 2026, and council borrowed from the CRF in June 2025 to pay the insurance premium.",
        priority: "moderate",
        evidence: "documented",
        pages: [223, 396],
      },
    ],
  },
  details: [
    {
      id: "depreciation",
      reviewed: "RDH Depreciation Report Update (October 31, 2025), the 2022 BECA cost estimates and the superseded 2012 report.",
      items: [
        { text: "The report's status is unclear: the cover says October 31, 2025, the text says 2023, and the cash-flow appendix is marked DRAFT.", priority: "moderate", evidence: "documented", pages: [407, 412, 428] },
        { text: "Further out, the report projects about $38.4 million of levies in 2038 to 2041 for window wall and curtain wall replacement.", priority: "moderate", evidence: "documented", pages: [449, 545] },
        { text: "Many systems were recently renewed: fire alarm panels (2019), hot water tanks (2019), heat exchangers (2023 to 2024).", priority: "routine", evidence: "documented", pages: [416, 460] },
      ],
      routine_summary: null,
    },
    {
      id: "minutes",
      reviewed: "Council minutes May 2024 to April 14, 2026; AGMs July 2024 and July 2025; SGM August 2021.",
      items: [{ text: "Repeated plumbing floods in the Waterworks tower in 2025 (a blocked 08 stack twice in about six months). None names unit 1909's stack.", priority: "moderate", evidence: "documented", pages: [184, 201, 205] }],
      routine_summary: "Fire inspection follow-ups, generator servicing, pest control and rule enforcement were handled in the normal course.",
    },
    { id: "financial", reviewed: "2025/26 budget, statements to March 31, 2026 and AGM fee schedules.", items: [{ text: "Water and sewer were $496,074 year-to-date against a $325,000 full-year budget.", priority: "moderate", evidence: "documented", pages: [399, 400] }], routine_summary: "Receivables of $73,102 are modest for a 535-lot complex." },
    { id: "insurance", reviewed: "Broker's summary of coverages, policy May 1, 2026 to May 1, 2027.", items: [{ text: "The earthquake deductible is 10% of the damaged buildings' value, minimum $250,000, shared by all owners.", priority: "moderate", evidence: "documented", pages: [403, 405] }], routine_summary: "Coverage is replacement cost with a 130% extended limit, appraised May 1, 2026." },
    { id: "bylaws", reviewed: "Bylaws revised July 15, 2025 and rules revised June 10, 2025.", items: [{ text: "Bylaw 8(2) can be read as making owners responsible for windows, doors and balconies that are part of a strata lot; ask how council applies it.", priority: "moderate", evidence: "interpretation", pages: [22, 27] }], routine_summary: "Move-in fees, fines and quiet hours are within normal ranges." },
    { id: "legal", reviewed: "Form B, strata plan, CRT notice and 2021 litigation papers.", items: [{ text: "Parking stall 451 is common property held by partial assignment of a lease; the strata's lawyer advised it will not warrant assignments without the original agreement.", priority: "moderate", evidence: "documented", pages: [4, 223, 391] }], routine_summary: null },
    { id: "engineering", reviewed: "2022 BECA Appendix E cost estimates only; the full BECA and later reviews were not provided.", items: [], routine_summary: null },
    { id: "regional", reviewed: "The documents raise no wildfire, flood, short-term rental zoning or bare land matters.", items: [], routine_summary: null },
  ],
  issues: [
    { issue: "Membrane leaks (patio, planter, roof)", first_recorded: "2024", last_recorded: "Apr 2026", status: "open", status_note: "engineer reviewing whether systemic", cost: null, pages: [164, 171, 191, 216] },
    { issue: "Elevator modernization (Landmark)", first_recorded: "Jul 2024", last_recorded: "Apr 2026", status: "in_progress", status_note: "behind schedule; last car due Nov 2026", cost: null, pages: [163, 359] },
    { issue: "Heat exchanger failures (Waterworks)", first_recorded: "Dec 2025", last_recorded: "Apr 2026", status: "in_progress", status_note: "replacement approved; 16-week lead time", cost: null, pages: [165, 175, 181, 183] },
    { issue: "Concrete falling from balcony eyebrows", first_recorded: "2025", last_recorded: "2025", status: "resolved", status_note: "engineer called it isolated; mesh installed", cost: null, pages: [190, 209, 217] },
  ],
  lifestyle_checks: [
    { text: "Pets: one per lot, registered within 30 days.", pages: [44, 45] },
    { text: "Short-term rentals are banned except homestay students; smoking is banned everywhere, including inside units.", pages: [23, 52] },
    { text: "Renovations to structure, windows, plumbing, electrical or heating need written approval; hardwood must float over approved underlay.", pages: [23, 24] },
  ],
  conflicts: [
    { what: "CRF balance: Form B $1,683,266 at April 30, 2026 against statements $2,082,521 at March 31, 2026.", pages: [3, 396] },
    { what: "Elevator project: council minutes say owners approved it at the July 2024 AGM; the AGM minutes show no elevator resolution.", pages: [163, 701] },
  ],
  documents_to_request: [
    { document: "2026 AGM and any SGM minutes, and the 2026/27 budget", why: "to show whether levies were voted for the 2026 to 2028 projects and this lot's fee now" },
    { document: "Council minutes May to November 2026", why: "seven months of decisions on leaks, elevators, roofs and funding" },
    { document: "A fresh Form B and the Legal Disclosure attachment", why: "the May 2026 certificate is six months old and its levy answer is vague" },
    { document: "Full 2022 BECA, EXP peer review and BMAC membrane findings", why: "they set the scope and cost of the largest projects" },
    { document: "Residential section budget and statements", why: "this lot may pay section fees not shown in the strata fee" },
    { document: "Lease assignment for parking stall 451", why: "the strata won't warrant the stall without it" },
  ],
  questions: [
    "Since April 2026, has any special levy been proposed or approved, and what is Strata Lot 403's share and due dates?",
    "What is the 2026/27 budget, this lot's monthly fee and the CRF contribution?",
    "Which funding scenario has council adopted for the 2026 to 2028 work, and is the October 2025 depreciation report final?",
    "What did BMAC conclude about whether the membrane leaks are systemic?",
    "Has unit 1909, its stack or the Landmark tower had leaks, floods or falling concrete?",
    "Does Strata Lot 403 pay residential section fees on top of $266.13?",
  ],
  who_to_ask: [
    { who: "lawyer or notary", about: "the parking lease assignment, the Legal Disclosure, and levy timing against your completion date" },
    { who: "home inspector or engineer", about: "the enclosure and membrane reports once you have them" },
    { who: "insurance broker", about: "cover for a $75,000 deductible assessment and an earthquake loss assessment" },
  ],
  form_b: [
    { item: "Monthly strata fee", answer: "$266.13 (2025/26); confirm the 2026/27 fee", follow_up: true, pages: [3] },
    { item: "Special levies (d)", answer: "Says any approved levy is payable now by the current owner; names none", follow_up: true, pages: [3] },
    { item: "Legal proceedings (j)", answer: "Yes; refers to a Legal Disclosure not in the package", follow_up: true, pages: [3] },
    { item: "Amount owing by the seller", answer: "$0.00", follow_up: false, pages: [3] },
    { item: "Notices or work orders", answer: "No", follow_up: false, pages: [3] },
    { item: "Unfiled bylaws or resolutions", answer: "No", follow_up: false, pages: [3] },
  ],
  red_flags: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    const present: Record<number, [Report["red_flags"][number]["status"], string, string | null]> = {
      2: ["partly", "The depreciation report says levies are unlikely to be avoided; council borrowed from the CRF in 2025.", "4"],
      5: ["present", "Under current funding the CRF falls to the report's $100,000 floor in 2026.", "4.1"],
      6: ["present", "The 2025/26 contribution is below every scenario in the report.", "4.1"],
      7: ["present", "Membrane leaks recorded in many lots, 2024 to 2026.", "3.1"],
      8: ["present", "A 2022 enclosure assessment and an engineer reviewing the leaks.", "3.1"],
      11: ["present", "Roofs, podium membrane, elevators and piping are at or past their expected life.", "3.2"],
      12: ["present", "Water damage deductible $75,000.", "3.3"],
      16: ["partly", "Operating deficit of $157,215 after 11 months; no strata loan.", "4.4"],
      17: ["partly", "The full BECA and later engineering reviews are mentioned but not provided.", "5.1"],
      19: ["partly", "No minutes after April 14, 2026 and no 2026/27 budget.", "5.1"],
    };
    const p = present[n];
    return p ? { n, status: p[0], note: p[1], ref: p[2] } : { n, status: n === 20 ? ("not_checked" as const) : ("not_shown" as const), note: "", ref: null };
  }),
  service_signals: { depreciation_report: "current", insurance_appraisal: "current" },
};

const tier = process.env.SAMPLE_TIER === "standard" ? "standard" : "expert";
const pdf = await renderReportPdf(
  report,
  segments,
  {
    orderId: "aa270f05-0000-0000-0000-000000000000",
    propertyAddress: "1909 - 1009 Expo Blvd, Vancouver, BC",
    unitNumber: "1909",
    strataPlan: "LMS2995",
    buyerName: "Sample Buyer",
    tier,
    preparedOn: new Date("2026-11-28T18:00:00Z"),
    totalPages: pages.length,
    fileCount: 1,
    ocrPages: 271,
    contactEmail: "report@condowiseguys.com",
    professionallyReviewed: process.env.SAMPLE_UNREVIEWED !== "1",
  },
  makeCiter(pages, manifest),
);
writeFileSync(output, pdf);
console.log("wrote", output, pdf.length, "bytes");
