import type { Report } from "./compose";

/**
 * Section 18: related services, only where a finding calls for one. Brian's rule: the report
 * makes no reference to appraisal or valuation services (lenders order appraisals), so only
 * depreciation reports are mentioned. The insurance appraisal date is reported as a fact in
 * section 14, with no service offer.
 */
export function relatedServiceNotes(signals: Report["service_signals"] | undefined) {
  const notes: string[] = [];
  const dr = signals?.depreciation_report;
  if (dr === "out_of_date")
    notes.push(
      "The strata's depreciation report appears to be more than 5 years old. BC strata corporations with 5 or more lots must get a new one at least every 5 years. DreamHomeGroup.ca prepares depreciation reports in BC, and the strata council can ask for a quote.",
    );
  if (dr === "not_found")
    notes.push(
      "No depreciation report was in the package. Ask the seller for it first. If the strata doesn't have a current one, DreamHomeGroup.ca prepares depreciation reports in BC.",
    );
  return notes;
}
