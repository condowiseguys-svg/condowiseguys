/**
 * Local check of the report writer's non-Claude parts: reads a PDF's text layer, finds the
 * scanned pages, and draws a sample report PDF from made-up findings.
 *   npx tsx scripts/render-sample.mts <package.pdf> <out.pdf>
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
const segments: Segment[] = [
  { start: 1, end: 6, type: "form_b", title: "Form B Information Certificate", date: "2025-10-01", superseded: false },
  { start: 7, end: 160, type: "minutes_council", title: "Council minutes, 2023-2025", date: null, superseded: false },
  { start: 161, end: 735, type: "depreciation_report", title: "Depreciation report – “2024 update”", date: "2024-03", superseded: false },
];
const item = (text: string, risk: "red" | "amber" | "green" | null, p: number[]) => ({ text, risk, pages: p });
const report: Report = {
  rating: "amber",
  rating_headline: "some costs to plan for",
  summary: "SAMPLE TEXT ONLY. The strata appears well run, but the depreciation report forecasts roof and piping work in the next five years that the reserve fund can’t fully cover. Expect a special levy of roughly $8,000–$12,000 for this unit ≈ 2027.",
  priorities: [
    "Get written confirmation of any approved or proposed special levy and this lot's share.",
    "Confirm the current monthly fee and any residential-section charges.",
    "Ask what the CRT dispute in the Legal Disclosure is and whether it is closed.",
    "Have your insurance broker confirm cover for the $75,000 water deductible.",
  ],
  top_findings: [
    item("Depreciation report forecasts $4.2M of work by 2029 against a $1.1M reserve.", "red", [429, 430, 431, 433]),
    item("Water damage deductible is $50,000 and can be charged back to the owner.", "amber", [403]),
    item("No special levy approved and the seller owes nothing.", "green", [3]),
  ],
  key_numbers: [
    { label: "Monthly strata fee", value: "$512.40", pages: [3] },
    { label: "CRF balance", value: "$1,104,220 (Sept 30, 2025)", pages: [3, 398] },
  ],
  levies: { rows: [{ period: "2027", status: "forecast", strata_total: "$2,100,000", unit_share: "about $9,800", pages: [431] }], basis: "Unit entitlement 140 of 30,000." },
  form_b: [{ item: "Special levies", answer: "None approved or proposed", risk: "green", pages: [3] }],
  sections: [
    { id: "financial", intro: "Sample intro.", items: [item("Operating surplus of $12,400.", "green", [396])] },
    { id: "minutes", intro: "Sample intro.", items: [item("Two leaks in the 04 stack in 2024.", "amber", [55, 88])] },
  ],
  red_flags: [
    { n: 1, status: "green", note: "No special levy approved on the Form B.", pages: [3] },
    { n: 5, status: "red", note: "The report models the CRF going below zero in 2028 at the current contribution.", pages: [433] },
    { n: 12, status: "amber", note: "Water damage deductible is $50,000.", pages: [403] },
    { n: 19, status: "not_checked", note: "Financial statements were not in the package.", pages: [] },
  ],
  missing_documents: [{ document: "Insurance certificate", why_it_matters: "Needed to confirm deductibles." }],
  questions: ["What is this unit’s share of the 2027 roof project?", "Have the 2024 leaks been repaired?"],
  service_signals: { depreciation_report: "current", insurance_appraisal: "out_of_date" },
};
const pdf = await renderReportPdf(report, segments, {
  orderId: "2f0492ca-0000-0000-0000-000000000000",
  propertyAddress: "403 - 1000 Expo Blvd, Vancouver BC",
  unitNumber: "403",
  strataPlan: "LMS2995",
  buyerName: "Sample Buyer",
  tier: "standard",
  preparedOn: new Date(),
  totalPages: pages.length,
  fileCount: 1,
  ocrPages: 166,
  contactEmail: "report@condowiseguys.com",
}, makeCiter(pages, manifest));
writeFileSync(output, pdf);
console.log("wrote", output, pdf.length, "bytes");
