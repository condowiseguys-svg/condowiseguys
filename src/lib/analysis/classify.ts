import { z } from "zod/v4";
import { askForJson } from "./claude";
import { DOC_TYPES, type DocType } from "./checklist";
import { renderIndex, type PackagePage } from "./pages";
import { mapLimit } from "./pool";

export type Segment = {
  start: number;
  end: number;
  type: DocType;
  title: string;
  date: string | null;
  superseded: boolean;
};

const SegmentSchema = z.object({
  segments: z.array(
    z.object({
      start: z.number().describe("First package page of this document"),
      end: z.number().describe("Last package page of this document"),
      type: z.enum(DOC_TYPES),
      title: z.string().describe("Short descriptive title, e.g. 'Council meeting minutes, March 12, 2025'"),
      date: z.string().nullable().describe("Document date as YYYY-MM-DD, YYYY-MM or YYYY; null if unknown"),
      superseded: z
        .boolean()
        .describe("True if a newer version of the same document is also in the package (e.g. an older depreciation report)"),
    }),
  ),
});

const SYSTEM = `You sort a British Columbia strata disclosure package into its separate documents.
You get the start of every page, each prefixed with its package page number in brackets.
Split the package into consecutive documents and label each one. Every page must belong to exactly one document; documents must not overlap and must be in page order.
Types:
- form_b: Form B Information Certificate and its attachments (unless an attachment is clearly another type below)
- bylaws_rules: bylaws, bylaw amendments, rules
- minutes_council: strata council meeting minutes (one document per meeting)
- minutes_general: AGM, SGM, or general meeting minutes, notices and agendas (one document per meeting)
- financial_statements: financial statements, income statements, balance sheets
- budget: approved or proposed operating budgets and CRF budgets
- depreciation_report: depreciation (reserve fund) reports
- insurance: insurance certificates, summaries, appraisals
- strata_plan: registered strata plan pages and schedule of unit entitlement
- engineering_report: building envelope, condition, roof, piping, parkade or other engineering reports
- electrical_planning_report: electrical planning reports, EV charging studies
- form_j: rental disclosure statements
- legal: court or Civil Resolution Tribunal documents, liens, legal letters
- correspondence: notices, newsletters, letters to owners
- other: anything else (cover pages, title searches, blank pages, property disclosure statements)
A page whose text says it is a scanned page that could not be read is NOT blank: give such pages their own document titled "Unreadable scanned pages" unless the pages around them show what they belong to.`;

/** Pages sorted per request. Bigger packages are sorted in parts. */
const CLASSIFY_CHUNK = 300;

/** Splits the whole package into documents. Pages the answer missed are filled in as "other". */
export async function classifyPackage(orderId: string, submission: number, pages: PackagePage[]): Promise<Segment[]> {
  const parts: PackagePage[][] = [];
  for (let i = 0; i < pages.length; i += CLASSIFY_CHUNK) parts.push(pages.slice(i, i + CLASSIFY_CHUNK));
  const answers = await mapLimit(parts, 3, async (part, k) => {
    const first = part[0].n;
    const last = part[part.length - 1].n;
    const answer = await askForJson({
      orderId,
      step: "Sort documents",
      costKey: `claude:classify:${orderId}:s${submission}:${k}`,
      schema: SegmentSchema,
      system: SYSTEM,
      effort: "medium",
      content: [
        {
          type: "text",
          text: `The package has ${pages.length} pages. Here is the start of pages ${first} to ${last}:\n\n${renderIndex(part)}\n\nSplit pages ${first} to ${last} into documents.${
            parts.length > 1 ? " A document may continue from before this range or after it; label the pages you see." : ""
          }`,
        },
      ],
    });
    return normalizeSegments(answer.segments as Segment[], last, first);
  });
  return mergeAdjacent(answers.flat());
}

/** Joins a document that was split across two sorting requests. */
function mergeAdjacent(segments: Segment[]) {
  const out: Segment[] = [];
  for (const s of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.end + 1 === s.start && prev.type === s.type && s.start % CLASSIFY_CHUNK === 1) {
      prev.end = s.end;
    } else out.push({ ...s });
  }
  return out;
}

/** Makes the segments cover pages first..total exactly once, in order. */
export function normalizeSegments(raw: Segment[], total: number, first = 1): Segment[] {
  const sorted = raw
    .map((s) => ({ ...s, start: Math.max(first, Math.round(s.start)), end: Math.min(total, Math.round(s.end)) }))
    .filter((s) => s.end >= s.start)
    .sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let next = first;
  for (const s of sorted) {
    if (s.end < next) continue;
    const start = Math.max(s.start, next);
    if (start > next) out.push({ start: next, end: start - 1, type: "other", title: "Unlabelled pages", date: null, superseded: false });
    out.push({ ...s, start });
    next = s.end + 1;
  }
  if (next <= total) out.push({ start: next, end: total, type: "other", title: "Unlabelled pages", date: null, superseded: false });
  return out;
}
