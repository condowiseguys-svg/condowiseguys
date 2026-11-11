/**
 * What a complete BC strata disclosure package should contain. Used when asking the buyer
 * for missing documents, and by the analysis step once it classifies each file.
 */
export const PACKAGE_ITEMS = [
  { id: "form_b", label: "Form B Information Certificate", required: true },
  { id: "bylaws_rules", label: "Bylaws and rules (current, with amendments)", required: true },
  { id: "minutes", label: "Council, AGM and SGM minutes (last 2 years)", required: true },
  { id: "financials", label: "Financial statements (most recent year)", required: true },
  { id: "budget", label: "Current operating budget and contingency reserve balance", required: true },
  { id: "depreciation_report", label: "Depreciation report (most recent)", required: true },
  { id: "insurance", label: "Insurance certificate or summary (with deductibles)", required: true },
  { id: "strata_plan", label: "Registered strata plan", required: false },
  { id: "engineering", label: "Engineering, envelope or building condition reports", required: false },
  { id: "electrical_planning", label: "Electrical planning report", required: false },
  { id: "form_j", label: "Rental disclosure statement (Form J)", required: false },
] as const;

export type PackageItemId = (typeof PACKAGE_ITEMS)[number]["id"];

export function missingRequired(found: Iterable<string>) {
  const have = new Set(found);
  return PACKAGE_ITEMS.filter((i) => i.required && !have.has(i.id));
}
