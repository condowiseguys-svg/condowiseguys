import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { founder, sisterCompany, sisterLink } from "@/lib/site";
import { DOC_TYPE_LABEL, RISK_ACTION, TOP_RED_FLAGS } from "./checklist";
import type { Segment } from "./classify";
import { SECTION_IDS, SECTION_TITLES, type Report } from "./compose";
import { LOGO_JPEG_BASE64 } from "./logo";

export type ReportMeta = {
  orderId: string;
  propertyAddress: string;
  unitNumber: string | null;
  strataPlan: string | null;
  buyerName: string;
  tier: "standard" | "expert";
  preparedOn: Date;
  totalPages: number;
  fileCount: number;
  ocrPages: number;
  contactEmail: string;
  /**
   * True when Brian reviews and approves this report before it is sent (Expert orders, and
   * Standard orders while AUTO_SEND_STANDARD is off). Only then does the report carry his
   * signed certification; a report sent without his review must not claim one.
   */
  professionallyReviewed: boolean;
};

type Risk = "red" | "amber" | "green";
type Cite = (pages: number[]) => string;

const NAVY = rgb(0.06, 0.12, 0.25);
const TEXT = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.4, 0.44, 0.5);
const RULE = rgb(0.86, 0.88, 0.91);
const RISK_COLOR: Record<Risk, RGB> = { red: rgb(0.78, 0.13, 0.13), amber: rgb(0.8, 0.5, 0.02), green: rgb(0.06, 0.55, 0.32) };
const RISK_LABEL: Record<Risk, string> = { red: "Red", amber: "Amber", green: "Green" };

const W = 612;
const H = 792;
const M = 54;
const CONTENT_W = W - 2 * M;
const BOTTOM = 60;

/** Lays out text top to bottom, adding pages as needed. */
class Layout {
  page!: PDFPage;
  y = 0;
  private safe = new Map<string, boolean>();
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {}

  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.y = H - M;
  }

  ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  /** Replaces characters the built-in PDF fonts can't draw. */
  clean(text: string, font: PDFFont) {
    let out = "";
    for (const ch of text.replace(/\r/g, "").replace(/\t/g, "    ")) {
      if (ch === "\n") {
        out += ch;
        continue;
      }
      let ok = this.safe.get(ch);
      if (ok === undefined) {
        try {
          font.widthOfTextAtSize(ch, 10);
          ok = true;
        } catch {
          ok = false;
        }
        this.safe.set(ch, ok);
      }
      if (ok) out += ch;
      else {
        const plain = ch.normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
        out += plain || (ch === "≈" ? "~" : ch === "→" ? "->" : ch === "≥" ? ">=" : ch === "≤" ? "<=" : "?");
      }
    }
    return out;
  }

  wrap(text: string, font: PDFFont, size: number, width: number) {
    const lines: string[] = [];
    for (const para of this.clean(text, font).split("\n")) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= width) {
          line = test;
          continue;
        }
        if (line) lines.push(line);
        // Break words longer than the line.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
      if (line) lines.push(line);
    }
    return lines;
  }

  text(text: string, opts: { size?: number; font?: PDFFont; color?: RGB; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.font;
    const x = opts.x ?? M;
    const width = opts.width ?? CONTENT_W - (x - M);
    const lh = size * 1.38;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(lh);
      this.page.drawText(line, { x, y: this.y - size, size, font, color: opts.color ?? TEXT });
      this.y -= lh;
    }
    this.y -= opts.gap ?? 0;
  }

  heading(text: string) {
    // Room for the heading and the first lines under it, so a heading never ends a page.
    this.ensure(110);
    this.y -= 10;
    this.text(text, { size: 14, font: this.bold, color: NAVY });
    this.page.drawRectangle({ x: M, y: this.y - 2, width: CONTENT_W, height: 1, color: RULE });
    this.y -= 10;
  }

  subheading(text: string) {
    this.ensure(80);
    this.y -= 4;
    this.text(text, { size: 11, font: this.bold, color: NAVY, gap: 2 });
  }

  pill(risk: Risk | "not_checked", x: number, yTop: number) {
    const label = risk === "not_checked" ? "Not checked" : RISK_LABEL[risk];
    const w = this.bold.widthOfTextAtSize(label, 8) + 12;
    this.page.drawRectangle({ x, y: yTop - 12, width: w, height: 12, color: risk === "not_checked" ? MUTED : RISK_COLOR[risk] });
    this.page.drawText(label, { x: x + 6, y: yTop - 9, size: 8, font: this.bold, color: rgb(1, 1, 1) });
    return w;
  }

  /** A finding: risk pill on the left, text, and its page reference underneath. */
  item(text: string, risk: Risk | "not_checked" | null, source: string, indent = 52) {
    const lines = this.wrap(text, this.font, 10, CONTENT_W - indent);
    this.ensure(Math.min(lines.length, 3) * 13.8 + 16);
    const top = this.y;
    if (risk) this.pill(risk, M, top - 1);
    else this.page.drawCircle({ x: M + 4, y: top - 6, size: 2, color: MUTED });
    this.text(text, { x: M + indent });
    if (source) this.text(`Source: ${source}`, { x: M + indent, size: 8, color: MUTED });
    this.y -= 6;
  }

  table(headers: string[], rows: string[][], widths: number[]) {
    const size = 9;
    const lh = size * 1.35;
    const drawRow = (cells: string[], font: PDFFont, color: RGB) => {
      const wrapped = cells.map((c, i) => this.wrap(c, font, size, widths[i] - 8));
      const h = Math.max(...wrapped.map((l) => l.length)) * lh + 6;
      this.ensure(h);
      let x = M;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, k) => this.page.drawText(line, { x: x + 2, y: this.y - 3 - size - k * lh, size, font, color }));
        x += widths[i];
      });
      this.y -= h;
      this.page.drawRectangle({ x: M, y: this.y, width: CONTENT_W, height: 0.6, color: RULE });
    };
    drawRow(headers, this.bold, MUTED);
    for (const r of rows) drawRow(r, this.font, TEXT);
    this.y -= 8;
  }
}

/** Draws a line of text that opens a web address when clicked. */
function drawLink(L: Layout, label: string, url: string, size = 10) {
  L.ensure(size * 1.6);
  const y = L.y - size;
  const w = L.bold.widthOfTextAtSize(label, size);
  L.page.drawText(label, { x: M, y, size, font: L.bold, color: rgb(0.12, 0.36, 0.85) });
  const annot = L.doc.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [M, y - 2, M + w, y + size],
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  const ref = L.doc.context.register(annot);
  const annots = L.page.node.lookup(PDFName.of("Annots"));
  if (annots && "push" in annots) (annots as { push: (r: unknown) => void }).push(ref);
  else L.page.node.set(PDFName.of("Annots"), L.doc.context.obj([ref]));
  L.y -= size * 1.6;
}

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

/**
 * The report's scope of work, assumptions and limiting conditions, and (only when Brian
 * reviews the report before it is sent) his certification. Written to meet the parts of
 * USPAP that apply to a valuation service that is not an appraisal or appraisal review:
 * the Ethics Rule (honest, impartial, not misleading, conflicts disclosed) and the
 * Competency Rule (scope stated; legal, building and insurance questions referred out).
 * No opinion of value is given, so Standards 1 and 2 (real property appraisal) do not apply.
 */
export function scopeOfWork(meta: Pick<ReportMeta, "buyerName" | "propertyAddress" | "unitNumber" | "strataPlan" | "ocrPages" | "professionallyReviewed">) {
  const lot = [meta.unitNumber ? `unit ${meta.unitNumber}` : null, meta.propertyAddress, meta.strataPlan ? `strata plan ${meta.strataPlan}` : null]
    .filter(Boolean)
    .join(", ");
  const reviewed = meta.professionallyReviewed;
  const terms: [string, string][] = [
    ["Client and intended user", `${meta.buyerName}, who ordered this report. The client may share it with their lawyer, notary, realtor or lender, but no one other than the client should rely on it.`],
    [
      "Intended use",
      `To help the client understand the strata documents for ${lot} and decide what to confirm before removing subjects on a purchase. It is not intended for any other use, such as lending, valuation, insurance or litigation.`,
    ],
    [
      "Type of service",
      "A review of the strata documents provided. No opinion of the property's value was developed or is reported, so this is not an appraisal or an appraisal review. It is also not a building inspection, a depreciation report, a legal opinion, insurance advice or financial advice.",
    ],
    [
      "Work performed",
      `Every page of the package provided was read${meta.ocrPages ? `, including ${meta.ocrPages} scanned pages read by text recognition` : ""}. AI software was used to read the documents, extract figures and draft the findings, which were checked against our BC strata document checklist${
        reviewed ? ` and then reviewed by ${founder.name}, who is responsible for this report` : ""
      }. Findings cite the package pages they come from.`,
    ],
    [
      "Work not performed",
      "We did not inspect the building or the unit, contact the strata corporation, its manager, council or the seller, search title, or check the documents against any other source. Information is as of the dates of the documents reviewed, listed above.",
    ],
  ];
  if (!reviewed)
    terms.push([
      "Review",
      "This Standard report was produced by our review process and was not individually reviewed by an appraiser before it was sent.",
    ]);
  const conditions = [
    "The documents provided are assumed to be authentic, complete for what they cover, and accurate. We did not audit them. If they are incomplete, out of date or wrong, the findings may change.",
    "Estimated special levy shares for this unit are illustrations. They assume a cost is shared by unit entitlement across the whole strata (or the section named). The actual share depends on the levy resolution, and a change in that assumption would change the estimates.",
    "Depreciation report forecasts and funding models are the report author's projections, not decisions by the owners. They are reported as given and were not re-estimated.",
    "Text recognition and AI extraction can misread figures. Check any figure that matters to your decision against the source page cited.",
    "Comments on bylaws, legal proceedings, building condition and insurance identify matters to confirm. They are not legal, engineering or insurance advice; confirm them with a lawyer or notary, a home inspector or engineer, and your insurance agent or broker.",
    "Nothing after the date of this report, or outside the package provided, is covered.",
  ];
  const certification = reviewed
    ? [
        "The statements of fact in this report are true and correct, based on the documents provided.",
        "The analyses and conclusions are limited only by the scope of work, assumptions and limiting conditions stated in this report, and are my personal, impartial and unbiased professional analyses and conclusions.",
        "I have no present or prospective interest in the property that is the subject of this report, and no personal interest with respect to the parties involved.",
        "I have no bias with respect to the property or to the parties involved in this assignment.",
        "My engagement was not contingent on developing or reporting predetermined results, and my compensation is not contingent on the conclusions reached, on whether the purchase completes, or on any later event.",
        `Within the three years before this report, I have performed no services regarding this strata lot or its strata corporation, as an appraiser or in any other capacity, including through ${sisterCompany.shortName}.`,
        "I have not inspected the property.",
        "AI software assisted in reading the documents and drafting this report under my direction. I have reviewed the report and take responsibility for it. No other person provided significant professional assistance.",
        "This review was carried out in conformity with the requirements of the Uniform Standards of Professional Appraisal Practice (USPAP) that apply to a valuation service that is not an appraisal or appraisal review, namely the Ethics Rule and the Competency Rule.",
      ]
    : null;
  return { terms, conditions, certification };
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Vancouver" });
}

/** Draws the finished report as a PDF. */
export async function renderReportPdf(report: Report, segments: Segment[], meta: ReportMeta, cite: Cite) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Strata Document Review: ${meta.propertyAddress}`);
  doc.setAuthor("Condo Wise Guys");
  doc.setCreator("Condo Wise Guys");
  doc.setCreationDate(meta.preparedOn);
  doc.setModificationDate(meta.preparedOn);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  // A fresh Uint8Array: pdf-lib reads the whole underlying memory and ignores a Buffer's
  // offset, so a pooled Buffer made it fail with "SOI not found in JPEG" on some runs.
  // A missing logo must never stop a report.
  const logo = await doc.embedJpg(new Uint8Array(Buffer.from(LOGO_JPEG_BASE64, "base64"))).catch((err) => {
    console.error("report logo could not be embedded", err);
    return null;
  });
  const L = new Layout(doc, font, bold);

  // ---- Cover band
  L.newPage();
  L.page.drawRectangle({ x: 0, y: H - 130, width: W, height: 130, color: NAVY });
  if (logo) L.page.drawImage(logo, { x: M, y: H - 112, width: 84, height: 84 });
  L.page.drawText("STRATA DOCUMENT REVIEW", { x: M + 102, y: H - 52, size: 10, font: bold, color: rgb(0.58, 0.77, 0.99) });
  const titleLines = L.wrap(meta.propertyAddress, bold, 18, CONTENT_W - 102).slice(0, 2);
  titleLines.forEach((t, i) => L.page.drawText(t, { x: M + 102, y: H - 76 - i * 22, size: 18, font: bold, color: rgb(1, 1, 1) }));
  L.y = H - 150;

  const facts = [
    ["Prepared for", meta.buyerName],
    ["Unit", meta.unitNumber || "Not given"],
    ["Strata plan", meta.strataPlan || "Not given"],
    ["Report", meta.tier === "expert" ? "Expert Reviewed" : "Standard"],
    ["Date", fmtDate(meta.preparedOn)],
    ["Package", `${meta.totalPages} pages in ${meta.fileCount} file${meta.fileCount === 1 ? "" : "s"}`],
  ];
  for (let i = 0; i < facts.length; i += 2) {
    for (let k = 0; k < 2 && i + k < facts.length; k++) {
      const [label, value] = facts[i + k];
      const x = M + k * (CONTENT_W / 2);
      L.page.drawText(label, { x, y: L.y - 9, size: 8, font: bold, color: MUTED });
      L.page.drawText(L.clean(value, font).slice(0, 48), { x, y: L.y - 22, size: 10, font, color: TEXT });
    }
    L.y -= 32;
  }

  // ---- Rating and summary
  L.y -= 6;
  L.ensure(40);
  L.page.drawText("Overall rating", { x: M, y: L.y - 12, size: 12, font: bold, color: NAVY });
  const pw = L.pill(report.rating, M + 92, L.y - 1);
  const hx = M + 100 + pw;
  const headline = L.wrap(report.rating_headline, bold, 11, CONTENT_W - (hx - M)).slice(0, 3);
  headline.forEach((t, i) => L.page.drawText(t, { x: hx, y: L.y - 11 - i * 14, size: 11, font: bold, color: TEXT }));
  L.y -= 24 + (headline.length - 1) * 14;
  L.text(
    `Ratings use the traffic light method from our Condo Buyers Guide. Red: ${RISK_ACTION.red.toLowerCase()}. Amber: ${RISK_ACTION.amber.toLowerCase()}. Green: ${RISK_ACTION.green.toLowerCase()}.`,
    { size: 8.5, color: MUTED, gap: 2 },
  );
  L.text(
    "This is a review of the strata documents provided. It is not an appraisal (no opinion of value is given), a building inspection or a legal opinion. Its scope, assumptions and limits are set out in \"Scope of work\" near the end.",
    { size: 8.5, color: MUTED, gap: 2 },
  );
  L.heading("Executive summary");
  L.text(report.summary, { size: 10.5, gap: 8 });
  if (report.priorities?.length) {
    L.subheading("Before you remove subjects");
    report.priorities.forEach((p, i) => L.text(`${i + 1}. ${p}`, { x: M + 12, gap: 3 }));
    L.y -= 6;
  }
  L.subheading("Top findings");
  report.top_findings.forEach((f) => L.item(f.text, f.risk, cite(f.pages)));

  // ---- Key numbers
  if (report.key_numbers.length) {
    L.heading("Key numbers");
    L.table(
      ["Item", "Amount or detail", "Source"],
      report.key_numbers.map((k) => [k.label, k.value, cite(k.pages)]),
      [170, 220, CONTENT_W - 390],
    );
  }

  // ---- Levies
  if (report.levies && report.levies.rows.length) {
    L.heading("Special levies: approved, proposed and forecast");
    L.table(
      ["Period", "Status", "Whole strata", "Estimated share for this unit", "Source"],
      report.levies.rows.map((r) => [r.period, r.status, r.strata_total, r.unit_share, cite(r.pages)]),
      [150, 58, 92, 124, CONTENT_W - 424],
    );
    L.text(report.levies.basis, { size: 8.5, color: MUTED, gap: 6 });
  }

  // ---- Form B
  L.heading("Form B, line by line");
  if (report.form_b.length) {
    report.form_b.forEach((f) => L.item(`${f.item}: ${f.answer}`, f.risk, cite(f.pages)));
  } else {
    L.text("No Form B Information Certificate was found in the package. Ask the seller for a current Form B before removing subjects.", { gap: 6 });
  }

  // ---- The guide's Top 20 Red Flags
  if (report.red_flags?.length) {
    // Report only the flags the documents provided let us assess. A flag we couldn't assess is
    // not evidence that anything is missing: the client's documents may simply be named or
    // organized differently, so we say nothing about it beyond a count.
    const assessed = TOP_RED_FLAGS.flatMap((flag, i) => {
      const row = report.red_flags.find((r) => r.n === i + 1);
      return row && row.status !== "not_checked" ? [{ flag, n: i + 1, row, status: row.status }] : [];
    });
    if (assessed.length) {
      L.heading("Red flag check: the Condo Buyers Guide's Top 20");
      L.text(
        "We checked the documents provided against the 20 red flags in our Condo Buyers Guide (Part 12.2). Red means the flag is present, amber means it is partly present or needs an answer, and green means the documents we reviewed do not show it.",
        { size: 9.5, color: MUTED, gap: 6 },
      );
      for (const { flag, n, row, status } of assessed) L.item(`${n}. ${flag}. ${row.note}`, status, row.pages.length ? cite(row.pages) : "", 70);
      const rest = TOP_RED_FLAGS.length - assessed.length;
      if (rest)
        L.text(`The other ${rest} red flag${rest === 1 ? "" : "s"} could not be assessed from the documents provided.`, {
          size: 9,
          color: MUTED,
          gap: 6,
        });
    }
  }

  // ---- Sections
  for (const id of SECTION_IDS) {
    const s = report.sections.find((x) => x.id === id);
    L.heading(SECTION_TITLES[id]);
    if (!s) {
      L.text("The documents provided did not cover this area.", { color: MUTED, gap: 6 });
      continue;
    }
    L.text(s.intro, { gap: 6 });
    s.items.forEach((it) => L.item(it.text, it.risk, cite(it.pages)));
  }

  // ---- Missing documents
  L.heading("Documents to ask for");
  if (report.missing_documents.length) {
    L.text(
      "We did not find these in the documents provided, or the version provided is out of date. They may exist under another name; if you have them, check them before removing subjects.",
      { size: 9.5, color: MUTED, gap: 6 },
    );
    report.missing_documents.forEach((m) => L.item(`${m.document}. ${m.why_it_matters}`, "amber", ""));
  } else {
    L.text("The documents provided cover the items we normally review.", { gap: 6 });
  }

  // ---- Questions
  L.heading("Questions to ask before removing subjects");
  report.questions.forEach((q, i) => L.text(`${i + 1}. ${q}`, { gap: 4 }));

  // ---- Related services (same owner, disclosed)
  L.heading("Related services from our sister company");
  L.text(
    `Condo Wise Guys and ${sisterCompany.name} are both owned by ${sisterCompany.owner}. We mention these services because they relate to what this review found. You are under no obligation to use them.`,
    { size: 9.5, color: MUTED, gap: 6 },
  );
  relatedServiceNotes(report.service_signals).forEach((n) => L.item(n, null, ""));
  drawLink(L, "dreamhomegroup.ca", sisterLink("report"));
  L.y -= 4;

  // ---- Documents reviewed
  L.heading("Documents reviewed");
  L.table(
    ["Pages", "Document", "Type"],
    segments
      .filter((s) => s.type !== "other" || s.end - s.start >= 2)
      .map((s) => [cite(Array.from({ length: s.end - s.start + 1 }, (_, i) => s.start + i)), `${s.title}${s.superseded ? " (older version)" : ""}`, DOC_TYPE_LABEL[s.type]]),
    [110, 270, CONTENT_W - 380],
  );

  // ---- Scope of work, assumptions and certification
  const scope = scopeOfWork(meta);
  L.heading("Scope of work");
  for (const [label, body] of scope.terms) {
    L.text(label, { size: 9.5, font: bold, color: NAVY, gap: 1 });
    L.text(body, { size: 9, gap: 5 });
  }
  L.subheading("Assumptions and limiting conditions");
  scope.conditions.forEach((c, i) => L.text(`${i + 1}. ${c}`, { size: 9, x: M + 12, gap: 3 }));
  L.y -= 4;
  if (scope.certification) {
    // Keep the certification and the signature together on one page.
    const certLines = scope.certification.reduce((n, c) => n + L.wrap(`- ${c}`, font, 9, CONTENT_W - 12).length, 0);
    L.ensure(certLines * 9 * 1.38 + scope.certification.length * 3 + 150);
    L.heading("Certification");
    L.text("I certify that, to the best of my knowledge and belief:", { size: 9.5, gap: 3 });
    scope.certification.forEach((c) => L.text(`- ${c}`, { size: 9, x: M + 12, gap: 3 }));
    L.y -= 8;
    L.text(founder.name, { size: 10.5, font: bold, color: NAVY });
    L.text(founder.designations, { size: 9 });
    L.text(`Report date: ${fmtDate(meta.preparedOn)}. Signed on my approval for delivery; this report is not sent until I approve it.`, {
      size: 8.5,
      color: MUTED,
      gap: 6,
    });
  }

  L.heading("About Condo Wise Guys");
  L.text(
    `Condo Wise Guys is owned by ${founder.name}, ${founder.designations}: ${founder.summary.charAt(0).toLowerCase()}${founder.summary.slice(1)} Read more at condowiseguys.com/about.`,
    { size: 9, color: MUTED, gap: 6 },
  );
  L.text(`Questions about this report: ${meta.contactEmail}. Order reference ${meta.orderId.slice(0, 8)}.`, { size: 9, color: MUTED });

  // ---- Footers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const left = L.clean(`Condo Wise Guys  |  ${meta.propertyAddress}`, font).slice(0, 90);
    p.drawRectangle({ x: M, y: 40, width: CONTENT_W, height: 0.6, color: RULE });
    p.drawText(left, { x: M, y: 28, size: 8, font, color: MUTED });
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawText(right, { x: W - M - font.widthOfTextAtSize(right, 8), y: 28, size: 8, font, color: MUTED });
  });

  return doc.save();
}
