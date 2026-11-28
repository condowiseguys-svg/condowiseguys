import type { Report } from "./compose";

/**
 * Section 18: services the findings suggest may be needed, stated neutrally. Brian's rule: the
 * report contains no sales pitch and names no provider (including Condo Wise Guys' sister
 * company), and makes no reference to appraisal or valuation services.
 */
export function relatedServiceNotes(signals: Report["service_signals"] | undefined) {
  const notes: string[] = [];
  const dr = signals?.depreciation_report;
  if (dr === "out_of_date")
    notes.push(
      "The strata's depreciation report appears to be more than 5 years old. BC strata corporations with 5 or more lots must obtain a new one at least every 5 years, so an updated depreciation report may be advisable; ask the strata manager whether one is planned.",
    );
  if (dr === "not_found")
    notes.push(
      "No depreciation report was in the package. Ask the seller for it. If the strata does not have a current one, it may need to obtain one; ask the strata manager whether one is planned.",
    );
  return notes;
}
