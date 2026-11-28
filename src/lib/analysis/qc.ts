import type { Report } from "./compose";

/**
 * Automated checks on a written report. Each problem is a short sentence the writer can act
 * on. They catch the failures a reviewer would otherwise have to find by hand: uncited
 * findings, figures that aren't in the notes, purchase advice, and highlights that grew too long.
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
  [/\b(?:value of the unit|unit\'s value|market value|offer (?:less|more)|lower the price|reduce the price)\b/i, "may comment on value or price"],
];

/** Numbers of 4+ digits (dollar figures, years excluded) in a piece of text. */
function bigNumbers(text: string) {
  return [...text.matchAll(/\$\s?([0-9][0-9,]{3,})(?:\.[0-9]+)?/g)].map((m) => m[1].replace(/,/g, ""));
}

export function checkReport(report: Report, notesText: string): string[] {
  const problems: string[] = [];
  const notesDigits = notesText.replace(/,/g, "");

  if (report.risk_profile.length !== 3) problems.push("risk_profile must have exactly three rows (building, finances, insurance_legal)");
  if (report.top_issues.length > 5) problems.push(`top_issues has ${report.top_issues.length} items; at most 5`);
  if (!report.top_issues.length) problems.push("top_issues is empty; give the 3 to 5 matters that matter most");

  report.findings.forEach((f, i) => {
    if (!f.pages.length) problems.push(`finding ${i + 1} ("${f.title}") cites no pages`);
  });
  report.details.forEach((d) =>
    d.items.forEach((it, i) => {
      if (!it.pages.length && it.priority !== "routine") problems.push(`detail ${d.id} item ${i + 1} cites no pages`);
    }),
  );
  const routineShare = (() => {
    const all = report.details.flatMap((d) => d.items);
    return all.length ? all.filter((x) => x.priority === "routine").length / all.length : 1;
  })();
  if (report.findings.length > 14) problems.push(`there are ${report.findings.length} key findings; keep only high and moderate matters that matter to this buyer (usually 3 to 12)`);
  if (routineShare < 0.3 && report.details.flatMap((d) => d.items).length > 10)
    problems.push("fewer than 30% of detail items are routine; check that priorities follow the thresholds and are not inflated");

  // Dollar figures in the highlights must come from the notes (derived figures are added by the software, not written here).
  const highlights = [
    ...report.top_issues.map((t) => t.text),
    report.summary.picture,
    report.summary.second_tier,
    report.summary.unknowns,
    ...report.risk_profile.map((r) => r.why),
    ...report.findings.map((f) => f.shows),
  ].join("\n");
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

  const all = JSON.stringify({ ...report, service_signals: undefined, figures: undefined });
  for (const [re, why] of BANNED) if (re.test(all)) problems.push(`the report ${why}`);

  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  const summaryWords = words(report.summary.picture) + words(report.summary.second_tier) + words(report.summary.unknowns);
  if (summaryWords > 260) problems.push(`the executive summary is ${summaryWords} words; keep it to about 200`);

  if (report.red_flags.length !== 20) problems.push(`red_flags has ${report.red_flags.length} rows; it needs all 20`);
  return [...new Set(problems)];
}
