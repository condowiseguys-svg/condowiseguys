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
import { checkReport } from "@/lib/analysis/qc";
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
  property_description:
    "The subject is Strata Lot 403 (unit 1909) in Landmark 33, a residential high-rise tower in the Marina Pointe complex at 1009 Expo Boulevard, on the north shore of False Creek in downtown Vancouver. Marina Pointe is a sectioned strata of 535 lots (530 residential and 5 commercial) in several towers over a shared podium and underground parkade. The buildings are of concrete construction with rainscreen walls and were completed in about 1998. Common facilities documented in the package include a fitness centre, guest suites and a concierge. The complex is professionally managed.",
  report_info: {
    newest_document: "council minutes April 14, 2026",
    newest_document_age: "7 months old",
    depreciation_report: "RDH Building Science update, October 31, 2025",
    management: "Professionally managed",
  },
  overall: {
    rating: "red",
    statement: "Major renewals are due now and the reserve fund cannot pay for them, so the purchaser should expect material additional costs; the rest of the strata's administration is in reasonable order.",
    areas: [
      {
        area: "building",
        rating: "red",
        why: "About $33.8 million of roof, podium, wall, piping and elevator renewals are forecast for 2026 to 2028, membrane leaks recur, and key engineering reports are not in the package.",
        refs: ["11", "12"],
      },
      {
        area: "finances",
        rating: "red",
        why: "Reserves are small next to the work ahead, the contribution is below every funding scenario in the depreciation report, and the operating fund was in deficit.",
        refs: ["6", "10"],
      },
      {
        area: "insurance_legal",
        rating: "amber",
        why: "A $75,000 water damage deductible can be charged to an owner, and the Form B refers to legal proceedings whose disclosure is missing. Management and council are stable.",
        refs: ["14", "15"],
      },
    ],
  },
  executive_summary: [
    "Landmark 33 is a concrete tower in a large, professionally managed complex. Its main challenge is funding, not management. Most original roofs, podium and deck membranes, walls, piping and elevators reach the end of their life together, and the October 2025 depreciation report forecasts about $33.8 million of work in 2026 to 2028.",
    "The reserve fund of $2,082,521 covers only a small part of that work. Under current funding the depreciation report projects special levies in each of 2026, 2027 and 2028; under its higher-contribution scenarios, fees would rise sharply instead. No levy for this work had been approved as of April 2026, and the 2026 AGM results are not in the package.",
    "The 2025/26 operating year was running a deficit, membrane leaks recur across the complex, and the $75,000 water damage deductible can be charged to an owner. In the building's favour: concrete rainscreen construction, a current depreciation report and insurance appraisal, broad coverage, stable management, and no work orders or arrears for this lot.",
  ],
  before_you_remove_subjects: [
    { action: "Obtain the 2026 AGM minutes, any SGM minutes and the 2026/27 budget.", why: "They show whether a levy or fee increase was approved after April 2026", ref: "7" },
    { action: "Ask your lawyer or notary to obtain the Legal Disclosure the Form B refers to.", why: "The Form B says proceedings exist but the disclosure is missing", ref: "8" },
    { action: "Ask for BMAC Engineering's findings on the membrane leaks and the full 2022 BECA.", why: "They set the scope and cost of the largest projects", ref: "12" },
    { action: "Ask your insurance broker whether your unit owner policy would cover a $75,000 deductible chargeback.", why: "The bylaws let the strata charge it to the owner", ref: "14" },
    { action: "Have your lawyer or notary review the lease assignment for parking stall 451.", why: "The strata will not warrant the stall without the original agreement", ref: "15" },
  ],
  top_findings: [
    {
      title: "About $33.8 million of renewals forecast for 2026 to 2028",
      rating: "red",
      text: "The RDH update forecasts roof and deck membranes, the podium membrane, EIFS walls, re-piping and elevator modernization within three years. The estimates are Class D (plus or minus 50%) and mostly exclude soft costs, so actual costs could be higher.",
      pages: [418, 419, 427, 445, 465],
      ref: "11",
    },
    {
      title: "Reserves can't fund the work; levies or steep fee increases are projected",
      rating: "red",
      text: "The CRF was $2,082,521 at March 31, 2026, against forecast spending of tens of millions. The depreciation report projects levies under current funding; this is a projection, not an approved levy.",
      pages: [396, 429, 545],
      ref: "7",
    },
    {
      title: "Membrane leaks are recurring across the complex",
      rating: "red",
      text: "Minutes from May 2024 to April 2026 record leaks through patio, planter and roof membranes into at least 11 strata lots. Council asked an engineer in March 2026 whether they are systemic; the answer is not in the package.",
      pages: [164, 171, 191, 216],
      ref: "12",
    },
    {
      title: "A $75,000 water damage deductible can be charged to the owner",
      rating: "amber",
      text: "The bylaws let the strata charge the deductible to an owner whose unit causes a loss, with no cap. Whether a unit owner policy responds is a question for the purchaser's insurance broker.",
      pages: [39, 40, 403],
      ref: "14",
    },
    {
      title: "Form B says legal proceedings exist, but its disclosure is missing",
      rating: "amber",
      text: "The Form B answers yes to court, arbitration or tribunal proceedings and refers to an attached Legal Disclosure that is not in the package. The only matter found, a $300 CRT dispute, was withdrawn in October 2025.",
      pages: [3, 10, 202],
      ref: "15",
    },
    {
      title: "Insurance and management are in good order",
      rating: "green",
      text: "Coverage is replacement cost with a 130% extended limit, appraised May 1, 2026, and the strata is professionally managed with a stable council.",
      pages: [403, 405],
      ref: "14",
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
  key_numbers_other: [
    { label: "Earthquake deductible", value: "10% of the damaged buildings' value, minimum $250,000", pages: [403] },
    { label: "Operating fund owed to the CRF", value: "$271,982 at March 31, 2026", pages: [396] },
  ],
  levies: [
    { period: "2021 SGM: settlement levy", status: "approved", strata_total: "$1,000,000", note: "paid in six instalments ending Dec 1, 2023", pages: [378] },
    { period: "2026 (depreciation report forecast)", status: "forecast", strata_total: "$7,487,425", note: null, pages: [429, 545] },
    { period: "2027 (depreciation report forecast)", status: "forecast", strata_total: "$17,451,879", note: null, pages: [429, 545] },
    { period: "2028 (depreciation report forecast)", status: "forecast", strata_total: "$7,922,261", note: null, pages: [429, 545] },
  ],
  levy_comment:
    "The only approved levy was the 2021 settlement levy, fully paid in 2023. The 2026 to 2028 amounts are the depreciation report's current-funding projection, which assumes contributions stay at $223,462 a year (the 2025/26 budget is $199,005). In this sectioned strata the share also depends on which section pays; a residential-only cost would be about 3.6% higher.",
  form_b: [
    { item: "Monthly strata fee", answer: "$266.13 (2025/26); confirm the 2026/27 fee", rating: "amber", pages: [3] },
    { item: "Special levies (d)", answer: "Says any approved levy is payable now by the current owner; names none", rating: "amber", pages: [3] },
    { item: "Legal proceedings (j)", answer: "Yes; refers to a Legal Disclosure not in the package", rating: "amber", pages: [3] },
    { item: "Amount owing by the seller", answer: "$0.00", rating: "green", pages: [3] },
    { item: "Notices or work orders", answer: "No", rating: "green", pages: [3] },
    { item: "Unfiled bylaws or resolutions", answer: "No", rating: "green", pages: [3] },
  ],
  red_flags: Array.from({ length: 20 }, (_, i) => {
    const n = i + 1;
    const present: Record<number, [Report["red_flags"][number]["status"], string, string | null]> = {
      2: ["partly", "The depreciation report says levies are unlikely to be avoided; council borrowed from the CRF in 2025.", "10"],
      5: ["present", "Under current funding the CRF falls to the report's $100,000 floor in 2026.", "11"],
      6: ["present", "The 2025/26 contribution is below every scenario in the report.", "10"],
      7: ["present", "Membrane leaks recorded in many lots, 2024 to 2026.", "12"],
      8: ["present", "A 2022 enclosure assessment and an engineer reviewing the leaks.", "15"],
      11: ["present", "Roofs, podium membrane, elevators and piping are at or past their expected life.", "11"],
      12: ["present", "Water damage deductible $75,000.", "14"],
      16: ["partly", "Operating deficit of $157,215 after 11 months; no strata loan.", "10"],
      17: ["partly", "The full BECA and later engineering reviews are mentioned but not provided.", "16"],
      19: ["partly", "No minutes after April 14, 2026 and no 2026/27 budget.", "16"],
    };
    const p = present[n];
    return p ? { n, status: p[0], note: p[1], ref: p[2] } : { n, status: n === 20 ? ("not_checked" as const) : ("not_shown" as const), note: "", ref: null };
  }),
  analysis: [
    {
      id: "financial",
      reviewed: "2025/26 budget, financial statements to March 31, 2026, and the AGM fee schedules.",
      conclusion: "The operating budget is under strain and the reserve contribution is well below what the depreciation report models for the work ahead.",
      items: [
        { text: "The operating fund owed the CRF $271,982 at March 31, 2026, and council borrowed from the CRF in June 2025 to pay the insurance premium.", rating: "amber", evidence: "documented", pages: [223, 396] },
        { text: "Water and sewer were $496,074 year-to-date against a $325,000 full-year budget.", rating: "amber", evidence: "documented", pages: [399, 400] },
        { text: "Receivables of $73,102 are modest for a 535-lot complex, and this lot owes nothing.", rating: "green", evidence: "documented", pages: [3, 397] },
      ],
    },
    {
      id: "depreciation",
      reviewed: "RDH Depreciation Report Update (October 31, 2025), the 2022 BECA cost estimates and the superseded 2012 report.",
      conclusion: "The report identifies a concentrated period of major renewals in 2026 to 2028 that current reserves and contributions do not fund.",
      items: [
        { text: "The report's status is unclear: the cover says October 31, 2025, the text says 2023, and the cash-flow appendix is marked DRAFT.", rating: "amber", evidence: "documented", pages: [407, 412, 428] },
        { text: "Further out, the report projects about $38.4 million of levies in 2038 to 2041 for window wall and curtain wall replacement.", rating: "amber", evidence: "documented", pages: [449, 545] },
        { text: "Many systems were recently renewed: fire alarm panels (2019), hot water tanks (2019), heat exchangers (2023 to 2024).", rating: "green", evidence: "documented", pages: [416, 460] },
      ],
    },
    {
      id: "minutes",
      reviewed: "Council minutes May 2024 to April 14, 2026; AGMs July 2024 and July 2025; SGM August 2021.",
      conclusion: "The minutes show an active council dealing with recurring leaks and a large project backlog; owner engagement is low.",
      items: [
        { text: "Both the 2024 and 2025 AGMs missed quorum at the start, and in 2025 only two people ran for two council seats. Large levy votes need a 3/4 majority.", rating: "amber", evidence: "documented", pages: [686, 702, 705] },
        { text: "Repeated plumbing floods in the Waterworks tower in 2025 (a blocked 08 stack twice in about six months). None names unit 1909's stack.", rating: "amber", evidence: "documented", pages: [184, 201, 205] },
        { text: "Fire inspection follow-ups, generator servicing and pest control were handled in the normal course.", rating: "green", evidence: "documented", pages: [170, 188] },
      ],
    },
    {
      id: "bylaws",
      reviewed: "Bylaws revised July 15, 2025 and rules revised June 10, 2025.",
      conclusion: "The bylaws are typical for a downtown tower; one provision on owner responsibility for windows and balconies deserves clarification.",
      items: [
        { text: "Bylaw 8(2) can be read as making owners responsible for windows, doors and balconies that are part of a strata lot; ask how council applies it.", rating: "amber", evidence: "interpretation", pages: [22, 27] },
        { text: "Short-term rentals are prohibited except homestay students; long-term rentals are allowed. Smoking is prohibited everywhere, including inside units.", rating: "green", evidence: "documented", pages: [23, 52] },
        { text: "One pet per lot, registered within 30 days. Renovations to structure, windows, plumbing, electrical or heating need written approval.", rating: "green", evidence: "documented", pages: [23, 24, 44] },
      ],
    },
    {
      id: "insurance",
      reviewed: "Broker's summary of coverages, policy May 1, 2026 to May 1, 2027.",
      conclusion: "Coverage appears broad and current; the deductibles are the matters to take to the purchaser's insurance broker.",
      items: [
        { text: "Water damage and sewer backup deductibles are $75,000 each, and the bylaws allow the strata to charge them to the responsible owner.", rating: "amber", evidence: "documented", pages: [39, 40, 403] },
        { text: "The earthquake deductible is 10% of the damaged buildings' value, minimum $250,000, shared by all owners.", rating: "amber", evidence: "documented", pages: [403, 405] },
        { text: "Coverage is replacement cost with a 130% extended limit, based on an appraisal dated May 1, 2026.", rating: "green", evidence: "documented", pages: [403] },
      ],
    },
    {
      id: "other",
      reviewed: "Form B, strata plan, CRT notice, 2021 litigation papers and the 2022 BECA Appendix E cost estimates. The full BECA and later engineering reviews were not provided.",
      conclusion: "The legal and title matters are limited but need confirmation by the purchaser's lawyer or notary. The documents raise no wildfire, flood, short-term rental zoning or bare land matters.",
      items: [
        { text: "Parking stall 451 is common property held by partial assignment of a lease; the strata's lawyer advised it will not warrant assignments without the original agreement.", rating: "amber", evidence: "documented", pages: [4, 223, 391] },
        { text: "The Form B refers to a Legal Disclosure that is not in the package; the only matter found, a $300 CRT dispute, was withdrawn in October 2025.", rating: "amber", evidence: "documented", pages: [3, 10, 202] },
      ],
    },
  ],
  financial_interpretation:
    "The strata is funding its capital plan through special levies rather than reserves. That is a funding choice owners make at each AGM, not a fixed outcome: the realistic paths are large levies soon, a large permanent fee increase, or a mix. The 2025/26 fee fell because insurance costs fell, while the CRF contribution was cut and operating costs ran over budget; that combination usually leads to a catch-up increase. The 'Progressive' figure in the report is partly garbled, so confirm it before relying on the fee estimate.",
  issues: [
    { issue: "Membrane leaks (patio, planter, roof)", first_recorded: "2024", last_recorded: "Apr 2026", status: "open", status_note: "engineer reviewing whether systemic", cost: null, pages: [164, 171, 191, 216] },
    { issue: "Elevator modernization (Landmark)", first_recorded: "Jul 2024", last_recorded: "Apr 2026", status: "in_progress", status_note: "behind schedule; last car due Nov 2026", cost: null, pages: [163, 359] },
    { issue: "Heat exchanger failures (Waterworks)", first_recorded: "Dec 2025", last_recorded: "Apr 2026", status: "in_progress", status_note: "replacement approved; 16-week lead time", cost: null, pages: [165, 175, 181, 183] },
    { issue: "Concrete falling from balcony eyebrows", first_recorded: "2025", last_recorded: "2025", status: "resolved", status_note: "engineer called it isolated; mesh installed", cost: null, pages: [190, 209, 217] },
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
    "Has unit 1909, its stack or the Landmark tower had leaks, floods or falling concrete?",
    "Does Strata Lot 403 pay residential section fees on top of $266.13?",
    "How does council apply bylaw 8(2) to windows, doors and balconies?",
  ],
  service_signals: { depreciation_report: "current", insurance_appraisal: "current" },
};

// The fixture must pass the automated structure and rating checks (figure checks need real notes).
console.log("qc:", checkReport(report, JSON.stringify(report)));

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
