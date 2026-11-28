import { ANALYSIS_IDS, worstRating, type Report } from "./compose";

/**
 * Automated checks on a written report: the parts of the Final Quality Control list in
 * docs/report-standard.md that software can test. Each problem is a short sentence the writer
 * can act on. The rest of the list (figures against the source pages, facts versus analysis,
 * contradictions) is checked by Brian; see REVIEW_CHECKLIST.
 */
const BANNED: [RegExp, string][] = [
  [/\bstop and think hard\b/i, "uses the old action phrase 'stop and think hard'"],
  [/\bnegotiate or protect yourself\b/i, "uses the old action phrase 'negotiate or protect yourself'"],
  [/\b(?:you should|we recommend(?: that)? you) (?:not )?(?:buy|purchase|walk away|proceed)\b/i, "gives purchase advice"],
  [/\b(?:walk away|do not buy|don't buy)\b/i, "gives purchase advice"],
  [/\bguarantee[sd]?\b/i, "uses the word 'guarantee'"],
  [/\bcertif(?:y|ied|ies)\b/i, "uses 'certify' or 'certified'"],
  [/\b(?:is|are) (?:structurally sound|free of mould|code[- ]compliant|safe)\b/i, "states a building condition the review cannot establish"],
  [/\b(?:buy|purchase|get) (?:loss assessment|additional|extra) (?:coverage|insurance)\b/i, "tells the buyer to buy an insurance product (say what to ask the broker)"],
  [/\b(?:value of the unit|unit's value|market value|offer (?:less|more)|lower the price|reduce the price)\b/i, "may comment on value or price"],
  [/\bthe AI (?:has )?(?:determined|found|concluded)\b/i, "uses the phrase 'the AI has determined'"],
  [/\b(?:alarming|catastrophic|disastrous|shocking)\b/i, "uses alarmist language"],
];

/** The Final Quality Control list from the report standard, shown to Brian with every draft he checks. */
export const REVIEW_CHECKLIST = [
  "Material figures match the source documents.",
  "Source page references are right.",
  "Approved levies are kept apart from proposed or forecast levies.",
  "Facts are kept apart from analysis and assumptions.",
  "The overall rating is consistent with the findings.",
  "The Executive Summary reflects the most important findings.",
  "The report does not contradict itself.",
  "Missing documents and limitations are clearly identified.",
  "The report is concise and avoids repetition.",
  "The report follows the standard Condo Wise Guys structure.",
];

/** Numbers of 4+ digits (dollar figures, years excluded) in a piece of text. */
function bigNumbers(text: string) {
  return [...text.matchAll(/\$\s?([0-9][0-9,]{3,})(?:\.[0-9]+)?/g)].map((m) => m[1].replace(/,/g, ""));
}

export function checkReport(report: Report, notesText: string, missing: string[] = []): string[] {
  const problems: string[] = [];
  const notesDigits = notesText.replace(/,/g, "");
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

  // 10. The standard structure: every section present.
  if (!report.property_description.trim()) problems.push("section 1 (property description) is empty");
  if (report.overall.areas.length !== 3) problems.push("overall.areas must have exactly three rows (building, finances, insurance_legal)");
  for (const id of ANALYSIS_IDS) if (!report.analysis.some((a) => a.id === id)) problems.push(`analysis is missing the '${id}' section; every section is required`);
  if (report.red_flags.length !== 20) problems.push(`red_flags has ${report.red_flags.length} rows; it needs all 20`);
  if (!report.executive_summary.length) problems.push("the executive summary is empty");
  if (!report.before_you_remove_subjects.length) problems.push("section 4 (before you remove subjects) is empty");

  // 5. The overall rating is consistent with the findings.
  const worstArea = worstRating(report.overall.areas.map((a) => a.rating));
  if (worstArea && report.overall.rating !== worstArea)
    problems.push(`the overall rating is ${report.overall.rating.toUpperCase()} but the most serious area rating is ${worstArea.toUpperCase()}`);
  const redTop = report.top_findings.filter((f) => f.rating === "red").length;
  if (redTop && report.overall.rating !== "red") problems.push(`${redTop} top finding(s) are RED but the overall rating is ${report.overall.rating.toUpperCase()}`);
  if (report.overall.rating === "red" && !redTop) problems.push("the overall rating is RED but no top finding is RED");

  // Top findings: only the most important, each cited.
  if (report.top_findings.length > 7) problems.push(`there are ${report.top_findings.length} top findings; include only the most important (4 to 7)`);
  if (!report.top_findings.length) problems.push("top_findings is empty");
  report.top_findings.forEach((f, i) => {
    if (!f.pages.length) problems.push(`top finding ${i + 1} ("${f.title}") cites no pages`);
  });

  // 2. Page references on rated items.
  report.analysis.forEach((a) =>
    a.items.forEach((it, i) => {
      if (!it.pages.length && it.rating !== "green") problems.push(`section ${a.id} item ${i + 1} cites no pages`);
    }),
  );

  // Ratings must not drift upward.
  const items = report.analysis.flatMap((a) => a.items);
  const greenShare = items.length ? items.filter((x) => x.rating === "green").length / items.length : 1;
  if (items.length > 10 && greenShare < 0.3)
    problems.push("fewer than 30% of the items in sections 10 to 15 are GREEN; check that ratings follow the thresholds and are supported by the documents");

  // 3. Approved levies distinguished from proposed or forecast ones.
  const approved = report.levies.some((l) => l.status === "approved");
  const highlights = [
    ...report.executive_summary,
    report.overall.statement,
    ...report.overall.areas.map((a) => a.why),
    ...report.top_findings.map((t) => `${t.title} ${t.text}`),
    ...report.before_you_remove_subjects.map((b) => b.action),
    report.levy_comment,
  ].join("\n");
  if (!approved && /\b(?:approved (?:a )?special levy|special levy (?:was|has been|is) approved|levy (?:was|has been) (?:approved|passed|voted))\b/i.test(highlights))
    problems.push("the highlights call a levy approved, but no approved levy is listed in section 7; keep forecasts and approvals apart");
  if (/\b(?:will|must) (?:need to )?(?:impose|pass|levy|face) (?:a )?special levy\b|\bspecial levy (?:is|will be) (?:certain|inevitable|unavoidable)\b/i.test(highlights) && !approved)
    problems.push("the report predicts a special levy as certain although none is approved; describe it as a projected shortfall");

  // 1. Dollar figures in the highlights must come from the notes (derived figures are added by the software).
  const unknown = [...new Set(bigNumbers(highlights))].filter((n) => !notesDigits.includes(n));
  if (unknown.length)
    problems.push(`these dollar figures in the highlights are not in the notes: ${unknown.slice(0, 6).map((n) => `$${Number(n).toLocaleString("en-CA")}`).join(", ")} (use figures from the notes, or describe without the number)`);

  // Figures must be copied, not computed.
  const f = report.figures;
  const copied: [string, number | null | undefined][] = [
    ["crf_balance", f.crf_balance?.amount],
    ["annual_crf_contribution", f.annual_crf_contribution?.amount],
    ["monthly_fee", f.monthly_fee?.amount],
    ["recommended_contribution", f.recommended_contribution?.amount],
    ["water_deductible", f.water_deductible?.amount],
  ];
  for (const [name, v] of copied) {
    if (v == null) continue;
    const whole = String(Math.round(v));
    const fixed = v.toFixed(2);
    if (!notesDigits.includes(whole) && !notesDigits.includes(fixed) && !notesDigits.includes(String(v)))
      problems.push(`figures.${name} (${v}) does not appear in the notes; copy it exactly or leave it null`);
  }

  // 8. Missing documents identified.
  if (missing.length && !report.documents_to_request.length) problems.push("documents were not found in the package but section 16 (documents to ask for) is empty");

  // Professional limits and writing style.
  const all = JSON.stringify({ ...report, service_signals: undefined, figures: undefined });
  for (const [re, why] of BANNED) if (re.test(all)) problems.push(`the report ${why}`);

  // 9. Concise.
  const summaryWords = report.executive_summary.reduce((n, p) => n + words(p), 0);
  if (summaryWords > 300) problems.push(`the executive summary is ${summaryWords} words; keep it to about 220`);
  const pdWords = words(report.property_description);
  if (pdWords > 150) problems.push(`the property description is ${pdWords} words; keep it to about 60 to 120`);
  if (report.before_you_remove_subjects.length > 6) problems.push(`section 4 has ${report.before_you_remove_subjects.length} actions; keep the 3 to 6 most important`);

  return [...new Set(problems)];
}
