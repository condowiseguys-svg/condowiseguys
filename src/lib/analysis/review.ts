import { z } from "zod/v4";
import { askForJson } from "./claude";
import { DOC_TYPE_LABEL, type ReviewGroup } from "./checklist";
import type { Segment } from "./classify";
import { renderPages, type PackagePage } from "./pages";

export type OrderContext = {
  property_address: string;
  unit_number: string | null;
  strata_plan: string | null;
  notes: string | null;
};

const Risk = z.enum(["red", "amber", "green"]);

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
      risk: Risk.describe("red: serious cost or risk; amber: worth attention or a question; green: reassuring"),
      pages: z.array(z.number()).describe("Package pages that support this finding"),
    }),
  ),
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
- Be balanced: include reassuring (green) findings too, not only problems.`;

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
