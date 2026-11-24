import type { DocType } from "@/lib/analysis/checklist";

/**
 * A quick first guess at what each uploaded file is, from its name (including the folder it
 * sat in inside a ZIP) and the text of its first pages. Free and instant, so the buyer sees
 * their package sorted while they upload. The report pipeline still sorts every page with
 * Claude later; this guess only labels files, orders the package and spots gaps early.
 */
const RULES: { type: DocType; name?: RegExp; text?: RegExp }[] = [
  { type: "form_b", name: /form[\s_-]*b\b|information[\s_-]*certificate/i, text: /form\s*b\b[\s\S]{0,200}information certificate|information certificate[\s\S]{0,200}section 59/i },
  { type: "form_j", name: /form[\s_-]*j\b|rental[\s_-]*disclosure/i, text: /form\s*j\b[\s\S]{0,200}rental disclosure/i },
  { type: "depreciation_report", name: /depreciation|reserve[\s_-]*(fund)?[\s_-]*(study|report)|\bdr\b/i, text: /depreciation report|reserve fund study/i },
  { type: "electrical_planning_report", name: /electrical[\s_-]*planning|\bepr\b|ev[\s_-]*charg/i, text: /electrical planning report/i },
  { type: "engineering_report", name: /engineer|envelope|condition[\s_-]*(assessment|report)|\bbca\b|\bbecc?a\b|roof[\s_-]*(report|assessment)|piping|parkade|warranty/i, text: /building envelope (condition )?assessment|condition assessment|engineering report|warranty review/i },
  { type: "insurance", name: /insurance|certificate[\s_-]*of[\s_-]*insurance|\bcoi\b|appraisal|summary[\s_-]*of[\s_-]*coverage/i, text: /certificate of insurance|summary of (insurance|coverage)|insurance appraisal|policy period/i },
  { type: "bylaws_rules", name: /bylaw|by-law|\brules\b|amendment/i, text: /\bbylaws?\b[\s\S]{0,200}(strata property act|strata corporation)|schedule of standard bylaws/i },
  { type: "minutes_general", name: /\bagm\b|\bsgm\b|annual[\s_-]*general|special[\s_-]*general|general[\s_-]*meeting/i, text: /(annual|special) general meeting/i },
  { type: "minutes_council", name: /council|minutes|\bmtg\b|meeting/i, text: /council meeting|minutes of the (strata )?council/i },
  { type: "budget", name: /budget/i, text: /(operating|proposed|approved) budget/i },
  { type: "financial_statements", name: /financial|statement|balance[\s_-]*sheet|income|\bgl\b|ledger|bank[\s_-]*rec/i, text: /balance sheet|income statement|statement of (financial position|operations)/i },
  { type: "strata_plan", name: /strata[\s_-]*plan|\b(eps|lms|nw|bcs|vis|kas|vr)\d{2,}|unit[\s_-]*entitlement/i, text: /strata plan\b[\s\S]{0,200}(sheet|schedule of unit entitlement)|schedule of unit entitlement/i },
  { type: "legal", name: /\bcrt\b|tribunal|court|lien|claim|lawsuit|legal|notice[\s_-]*of[\s_-]*civil/i, text: /civil resolution tribunal|supreme court of british columbia|notice of civil claim/i },
  { type: "correspondence", name: /notice|newsletter|letter|memo|bulletin|announcement/i },
];

/** Best guess for one file. Text (when there is some) beats a vague file name. */
export function categorizeDocument(path: string, firstPagesText = ""): DocType {
  const text = firstPagesText.slice(0, 6000);
  if (text.replace(/\s+/g, "").length >= 80) {
    for (const r of RULES) if (r.text?.test(text)) return r.type;
  }
  for (const r of RULES) if (r.name?.test(path)) return r.type;
  return "other";
}

/** Order a package is easiest to read in: Form B first, supporting papers last. */
export const CATEGORY_ORDER: DocType[] = [
  "form_b",
  "bylaws_rules",
  "depreciation_report",
  "financial_statements",
  "budget",
  "insurance",
  "minutes_general",
  "minutes_council",
  "engineering_report",
  "electrical_planning_report",
  "strata_plan",
  "form_j",
  "legal",
  "correspondence",
  "other",
];

export function categoryRank(type: string | null | undefined) {
  const i = CATEGORY_ORDER.indexOf((type ?? "other") as DocType);
  return i === -1 ? CATEGORY_ORDER.length : i;
}
