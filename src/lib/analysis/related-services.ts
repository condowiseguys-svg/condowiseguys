import type { Report } from "./compose";

/** Plain-language suggestions tied to what the review found. */
export function relatedServiceNotes(signals: Report["service_signals"] | undefined) {
  const notes: string[] = [];
  const dr = signals?.depreciation_report;
  const ins = signals?.insurance_appraisal;
  if (dr === "out_of_date")
    notes.push(
      "The strata's depreciation report appears to be more than 5 years old. BC strata corporations with 5 or more lots must get a new one at least every 5 years. DreamHomeGroup.ca prepares depreciation reports in BC, and the strata council can ask for a quote.",
    );
  if (dr === "not_found")
    notes.push(
      "No depreciation report was in the package. Ask the seller for it first. If the strata doesn't have a current one, DreamHomeGroup.ca prepares depreciation reports in BC.",
    );
  if (ins === "out_of_date")
    notes.push(
      "The strata's insurance appraisal appears to be more than 3 years old, which can leave the building under-insured. DreamHomeGroup.ca prepares replacement cost appraisals for strata insurance.",
    );
  if (ins === "not_found")
    notes.push(
      "We couldn't find how the building's insured value was set. Ask the strata manager when the last insurance appraisal was done. DreamHomeGroup.ca prepares replacement cost appraisals for strata insurance.",
    );
  notes.push(
    "Want an independent opinion of the unit's market value before you remove subjects? DreamHomeGroup.ca provides market value appraisals.",
  );
  return notes;
}
