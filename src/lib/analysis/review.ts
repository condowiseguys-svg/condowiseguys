import { z } from "zod/v4";
import { askForJson } from "./claude";
import { DOC_TYPE_LABEL, PRIORITY_METHOD, type ReviewGroup } from "./checklist";
import type { Segment } from "./classify";
import { renderPages, type PackagePage } from "./pages";

export type OrderContext = {
  property_address: string;
  unit_number: string | null;
  strata_plan: string | null;
  notes: string | null;
};

const Priority = z.enum(["high", "moderate", "routine"]);

export const GroupReviewSchema = z.object({
  facts: z
    .array(
      z.object({
        label: z.string().describe("e.g. 'Monthly strata fee for this lot', 'CRF balance', 'Water damage deductible'"),
        value: z.string().describe("The value exactly as the documents give it, with its date if relevant"),
        pages: z.array(z.number()),
      }),
    )
    .describe("Key numbers and facts a buyer needs, each with the package pages that show it"),
  findings: z.array(
    z.object({
      title: z.string().describe("A short headline"),
      detail: z.string().describe("Two to four plain-language sentences: what the documents say and why it matters to a buyer"),
      priority: Priority.describe("By the priority method in the instructions; most findings are routine"),
      evidence: z.enum(["documented", "interpretation"]).describe("documented = a document states it; interpretation = your reading of what documented facts suggest"),
      pages: z.array(z.number()).describe("Package pages that support this finding"),
    }),
  ),
  issues: z
    .array(
      z.object({
        issue: z.string().describe("Short name, e.g. 'Membrane leaks (patio, planter, roof)'"),
        first_recorded: z.string().describe("Date of the first meeting or document that records it, e.g. 'May 2024'"),
        last_recorded: z.string(),
        mentions: z.number().nullable().describe("Number of meetings or documents that mention it, if you counted"),
        status: z.enum(["open", "in_progress", "resolved", "unknown"]),
        status_note: z.string().describe("One short phrase on where it stood at the last record"),
        cost: z.string().nullable().describe("Cost or estimate if the documents give one, else null"),
        pages: z.array(z.number()),
      }),
    )
    .describe("Recurring issues that appear in more than one meeting or document; empty if none"),
  conflicts: z
    .array(
      z.object({
        what: z.string().describe("What disagrees, e.g. 'CRF balance: Form B $1,683,266 (Apr 30 2026) vs statements $2,082,521 (Mar 31 2026)'"),
        pages: z.array(z.number()),
      }),
    )
    .describe("Places where two documents, or two parts of one document, disagree; empty if none"),
  levies: z
    .array(
      z.object({
        period: z.string().describe("Year or date range"),
        description: z.string(),
        status: z.enum(["approved", "proposed", "forecast"]),
        strata_total: z.string().describe("Amount for the whole strata, as given"),
        unit_share: z.string().nullable().describe("This lot's share if the documents state it, else null"),
        pages: z.array(z.number()),
      }),
    )
    .describe("Special levies approved, proposed, or forecast"),
  questions: z.array(z.string()).describe("Questions the buyer should ask the strata manager or seller before removing subjects"),
  coverage_note: z.string().describe("One sentence on what these documents cover (dates, period) and anything that looks missing"),
});
export type GroupReview = z.infer<typeof GroupReviewSchema>;

const SYSTEM = `You are a careful reviewer of British Columbia strata (condominium) documents, working for Condo Wise Guys. Your notes are used to write a review report for a home buyer who is deciding whether to remove subjects on a strata unit.

Rules:
- Use only what the documents say. Never guess numbers, dates, or names. If something is unclear or missing, say so.
- Cite the package page numbers (the n in <page n="...">) for every fact and finding.
- Write in plain Canadian English for a buyer who is not an expert. Explain strata terms briefly when you use them.
- Give amounts in dollars as written in the documents.
- Focus on what affects the buyer's costs, risks, and use of the unit. Skip routine items that do not matter to a buyer.
- Prefer the newest information. When documents conflict, say which is newer.
- Be balanced: include reassuring findings too (rated routine), not only problems.
- When the checklist names a red flag and the documents show it, report it as its own finding. When you looked for one of the main red flags and the documents show it is absent (for example no approved levies, no lawsuits), a short routine finding saying so is useful.
- Recurring matters across meetings belong in issues (one row each), not in a finding per meeting. Disagreements between documents belong in conflicts.
- A page reading "[scanned page that could not be read]" is not blank: say it could not be read. Read transcribed scanned pages as carefully as the rest.
- Separate projections (e.g. a depreciation report's funding model) from decisions owners actually made.
- When comparing results to a budget, say whether the budget figure is year-to-date or full-year.
- Do not give an opinion of the unit's value or price. Note legal, building-condition and insurance questions as matters to confirm with the right professional rather than concluding them.
- Never note the race, colour, religion, national or ethnic origin, sex, sexual orientation, gender identity, age, family status, disability or source of income of owners, residents or neighbours. Refer to owners by unit number, and leave out names of private individuals.

${PRIORITY_METHOD}`;

/** Pages for each group, split so that one request stays well inside the context window. */
export function groupChunks(group: ReviewGroup, segments: Segment[], pages: PackagePage[], maxChars = 400_000) {
  const segs = segments.filter((s) => group.types.includes(s.type));
  const chunks: { segments: Segment[]; pages: PackagePage[] }[] = [];
  let cur: { segments: Segment[]; pages: PackagePage[]; chars: number } = { segments: [], pages: [], chars: 0 };
  for (const s of segs) {
    const sp = pages.slice(s.start - 1, s.end);
    const chars = sp.reduce((a, p) => a + p.text.length + 20, 0);
    if (cur.pages.length && cur.chars + chars > maxChars) {
      chunks.push(cur);
      cur = { segments: [], pages: [], chars: 0 };
    }
    cur.segments.push(s);
    cur.pages.push(...sp);
    cur.chars += chars;
  }
  if (cur.pages.length) chunks.push(cur);
  return chunks;
}

function describeOrder(order: OrderContext) {
  return [
    `Property: ${order.property_address}`,
    `Unit: ${order.unit_number || "not given"}`,
    `Strata plan: ${order.strata_plan || "not given"}`,
    order.notes ? `Buyer's notes: ${order.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function describeSegments(segments: Segment[]) {
  return segments
    .map(
      (s) =>
        `- p. ${s.start}-${s.end}: ${s.title} (${DOC_TYPE_LABEL[s.type]}${s.date ? `, ${s.date}` : ""}${s.superseded ? ", superseded by a newer version" : ""})`,
    )
    .join("\n");
}

export async function reviewGroup(opts: {
  orderId: string;
  submission: number;
  group: ReviewGroup;
  chunkIndex: number;
  chunkCount: number;
  segments: Segment[];
  allSegments: Segment[];
  pages: PackagePage[];
  order: OrderContext;
}): Promise<GroupReview> {
  const part = opts.chunkCount > 1 ? ` (part ${opts.chunkIndex + 1} of ${opts.chunkCount})` : "";
  return askForJson({
    orderId: opts.orderId,
    step: `Review ${opts.group.title}`,
    costKey: `claude:review:${opts.orderId}:s${opts.submission}:${opts.group.id}:${opts.chunkIndex}`,
    schema: GroupReviewSchema,
    system: SYSTEM,
    effort: "high",
    content: [
      {
        type: "text",
        text: `<order>\n${describeOrder(opts.order)}\n</order>

<package_contents>
Everything in the buyer's package, for context:
${describeSegments(opts.allSegments)}
</package_contents>

<documents>
${renderPages(opts.pages)}
</documents>

Review the documents above: ${opts.group.title}${part}.
Check these points:
${opts.group.checks}`,
      },
    ],
  });
}
