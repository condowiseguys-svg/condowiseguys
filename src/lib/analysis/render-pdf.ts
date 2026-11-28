import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { founder, reviewScope } from "@/lib/site";
import { DOC_TYPE_LABEL, TOP_RED_FLAGS } from "./checklist";
import type { Segment } from "./classify";
import { ANALYSIS_IDS, SECTION_TITLES, analysisSection, byRating, type Report } from "./compose";
import { aboutDollars, deriveMetrics, money, parseDollars } from "./derive";
import { LOGO_JPEG_BASE64 } from "./logo";
import { relatedServiceNotes } from "./related-services";

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
   * True when Brian checks this report before it is sent: every Expert order, and Standard
   * orders while AUTO_SEND_STANDARD is off (the release check). Only an Expert report carries
   * his signed Reviewer's statement; a Standard report says it was checked, not reviewed.
   */
  professionallyReviewed: boolean;
  /** Brian's signature PNG, drawn on the Reviewer's statement of a reviewed Expert report. */
  signaturePng?: Uint8Array | null;
};

type Cite = (pages: number[], max?: number) => string;
type Tag = { label: string; color: RGB };

const NAVY = rgb(0.06, 0.12, 0.25);
const TEXT = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.4, 0.44, 0.5);
const RULE = rgb(0.86, 0.88, 0.91);
const SOFT = rgb(0.96, 0.97, 0.99);
const RED = rgb(0.72, 0.15, 0.15);
const AMBER = rgb(0.8, 0.5, 0.02);
const GREEN = rgb(0.1, 0.5, 0.32);

/** The Condo Wise Guys traffic-light rating (docs/report-standard.md). */
const TAG = {
  red: { label: "RED", color: RED },
  amber: { label: "AMBER", color: AMBER },
  green: { label: "GREEN", color: GREEN },
} satisfies Record<string, Tag>;

const RATING_LEGEND = {
  red: "RED: significant concern requiring careful consideration, further investigation or professional advice.",
  amber: "AMBER: a matter requiring clarification, planning, negotiation or attention.",
  green: "GREEN: reassuring, or reviewed without an identified material concern.",
};
const LEVY_STATUS = { approved: "Approved", proposed: "Proposed", forecast: "Forecast" } as const;

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

  pill(tag: Tag, x: number, yTop: number) {
    const w = this.bold.widthOfTextAtSize(tag.label, 7.5) + 10;
    this.page.drawRectangle({ x, y: yTop - 11.5, width: w, height: 11.5, color: tag.color });
    this.page.drawText(tag.label, { x: x + 5, y: yTop - 8.5, size: 7.5, font: this.bold, color: rgb(1, 1, 1) });
    return w;
  }

  /** A line or paragraph with a priority pill on the left and its source underneath. */
  tagged(text: string, tag: Tag, source: string, indent = 68, size = 9.5, font?: PDFFont) {
    const lines = this.wrap(text, font ?? this.font, size, CONTENT_W - indent);
    this.ensure(Math.min(lines.length, 3) * size * 1.38 + 16);
    this.pill(tag, M, this.y - 1);
    this.text(text, { x: M + indent, size, font });
    if (source) this.text(`Source: ${source}`, { x: M + indent, size: 8, color: MUTED });
    this.y -= 5;
  }

  /** An unrated point with its source. */
  bullet(text: string, source: string) {
    this.ensure(28);
    this.page.drawCircle({ x: M + 6, y: this.y - 6, size: 1.8, color: MUTED });
    this.text(text, { x: M + 16, size: 9.5 });
    if (source) this.text(`Source: ${source}`, { x: M + 16, size: 8, color: MUTED });
    this.y -= 4;
  }

  /** A shaded box with a bold title, kept on one page. */
  box(title: string, body: string) {
    const pad = 10;
    const size = 8.5;
    const lh = size * 1.38;
    const lines = this.wrap(body, this.font, size, CONTENT_W - 2 * pad);
    const h = pad + 13 + lines.length * lh + pad - 3;
    this.ensure(h + 8);
    this.page.drawRectangle({ x: M, y: this.y - h, width: CONTENT_W, height: h, color: SOFT, borderColor: RULE, borderWidth: 0.8 });
    this.page.drawText(title, { x: M + pad, y: this.y - pad - 9, size: 9.5, font: this.bold, color: NAVY });
    lines.forEach((t, i) => this.page.drawText(t, { x: M + pad, y: this.y - pad - 13 - size - i * lh, size, font: this.font, color: TEXT }));
    this.y -= h + 8;
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
    if (headers.some(Boolean)) drawRow(headers, this.bold, MUTED);
    for (const r of rows) drawRow(r, this.font, TEXT);
    this.y -= 8;
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Vancouver" });
}

const dollars2 = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x: number) => `about ${x < 0.01 ? (x * 100).toFixed(2) : x < 0.1 ? (Math.round(x * 1000) / 10).toFixed(1).replace(/\.0$/, "") : Math.round(x * 100)}%`;
const firstYear = (s: string) => {
  const m = s.match(/\b(20\d\d)\b/);
  return m ? Number(m[1]) : null;
};

/** Section 20: each item is a bold lead-in, then the body. */
export function scopeText(meta: Pick<ReportMeta, "buyerName" | "propertyAddress" | "unitNumber" | "strataPlan" | "ocrPages" | "professionallyReviewed" | "tier" | "totalPages">) {
  const lot = [meta.unitNumber ? `unit ${meta.unitNumber}` : null, meta.propertyAddress, meta.strataPlan ? `strata plan ${meta.strataPlan}` : null]
    .filter(Boolean)
    .join(", ");
  const check =
    meta.tier === "expert" && meta.professionallyReviewed
      ? `${founder.name} reviewed and verified the findings, the financial analysis and this report before delivery (section 21).`
      : meta.professionallyReviewed
        ? `Before delivery, ${founder.name} checked the key figures, special levies and Top Findings against their source pages (section 21). A Standard Review does not receive the full professional review of an Expert Review; you can upgrade with full credit for what you paid.`
        : "This Standard report was produced by the Condo Wise Guys review process and was not checked by a person before delivery (section 21).";
  return [
    [
      "Intended use and user",
      `This report was prepared for ${meta.buyerName} to help them understand the strata documents for ${lot} before deciding on a purchase. They may share it with their lawyer, notary, realtor or lender, but no one else may rely on it, and it is not intended for lending, insurance or litigation.`,
    ],
    [
      "Scope of work",
      `We read all ${meta.totalPages} pages provided${meta.ocrPages ? `, including ${meta.ocrPages} scanned pages read by text recognition` : ""}, and reviewed them against the Condo Wise Guys BC strata checklist and the 20 red flags in our Condo Buyers Guide. AI software assisted with document extraction, analysis and drafting under the direction of ${founder.name}. Figures marked "derived" were calculated by our software from the cited figures, by the method shown. ${check}`,
    ],
    [
      "Not included",
      `We did not contact the strata corporation, its manager, its council or the seller, search title, audit the financial statements, or check the documents against any other source. ${reviewScope.full.join(" ")}`,
    ],
    [
      "Assumptions",
      "The documents are assumed to be authentic, accurate, complete and current. Information is as of each document's date; anything after the newest document, or outside the package, is not covered. Unit shares assume costs are shared by unit entitlement.",
    ],
    [
      "Limiting conditions",
      "Unit shares are illustrations only: the actual share depends on each levy resolution and, in a sectioned strata, on which section pays. Depreciation report figures are its author's projections, not decisions by owners, and no future cost is assured. Comments on bylaws, legal matters, building condition and insurance identify questions for a lawyer or notary, an inspector or engineer, or an insurance broker; they are not advice. This review does not recommend whether to buy.",
    ],
    [
      "Corrections",
      "Text recognition can misread figures. If you find a figure that doesn't match its cited page, tell us and we will correct the report at no charge.",
    ],
  ] as [string, string][];
}

/** The signed certification on a reviewed Expert report. */
export function reviewerStatement() {
  return [
    "The statements of fact in this report are taken from the documents provided, and the source of each is cited.",
    "The analysis and conclusions are my own impartial and unbiased professional analysis, limited only by the scope of work, assumptions and limiting conditions in section 20.",
    "I have no present or prospective interest in this property and no personal interest in the parties.",
    "My fee does not depend on the findings, on whether the purchase completes, or on any later event.",
    "In the three years before this report I performed no services regarding this strata lot or its strata corporation, in any capacity.",
    "I did not inspect the property.",
    "AI software assisted with document extraction, analysis and drafting under my direction. I reviewed and verified the findings.",
  ];
}

/** Draws the finished report as a PDF, in the 21 sections of the report standard. */
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
  const today = new Date(meta.preparedOn.toLocaleString("en-US", { timeZone: "America/Vancouver" }));
  const fig = report.figures;
  const d = deriveMetrics(fig, today.getFullYear());
  const reviewedExpert = meta.tier === "expert" && meta.professionallyReviewed;
  const shareText =
    fig.lot_entitlement && fig.total_entitlement
      ? `unit entitlement ${fig.lot_entitlement.toLocaleString("en-CA")} of ${fig.total_entitlement.toLocaleString("en-CA")}`
      : null;
  const H_ = (n: number) => `${n}. ${SECTION_TITLES[n - 1]}`;
  const none = (t: string) => L.text(t, { size: 9.5, color: MUTED, gap: 4 });
  const numbered = (xs: string[]) => xs.forEach((t, i) => L.text(`${i + 1}. ${t}`, { x: M + 10, size: 9.5, gap: 2 }));

  // ---------------------------------------------------------------- Cover band
  L.newPage();
  L.page.drawRectangle({ x: 0, y: H - 118, width: W, height: 118, color: NAVY });
  if (logo) L.page.drawImage(logo, { x: M, y: H - 104, width: 76, height: 76 });
  L.page.drawText("STRATA DOCUMENT REVIEW", { x: M + 94, y: H - 46, size: 9.5, font: bold, color: rgb(0.58, 0.77, 0.99) });
  L.wrap(meta.propertyAddress, bold, 17, CONTENT_W - 94)
    .slice(0, 2)
    .forEach((t, i) => L.page.drawText(t, { x: M + 94, y: H - 68 - i * 21, size: 17, font: bold, color: rgb(1, 1, 1) }));
  const sub = [
    meta.unitNumber ? `Unit ${meta.unitNumber}` : null,
    meta.strataPlan ? `Strata plan ${meta.strataPlan}` : null,
    meta.tier === "expert" ? "Expert Review" : "Standard Review",
    fmtDate(meta.preparedOn),
  ]
    .filter(Boolean)
    .join("   |   ");
  L.page.drawText(L.clean(sub, font), { x: M + 94, y: H - 104, size: 9, font, color: rgb(0.85, 0.9, 0.97) });
  L.y = H - 128;

  // ---------------------------------------------------------------- 1. Property description
  L.heading(H_(1));
  L.text(report.property_description, { size: 10, gap: 4 });

  // ---------------------------------------------------------------- 2. Report information and overall assessment
  L.heading(H_(2));
  const ri = report.report_info;
  L.table(
    ["", ""],
    [
      ["Prepared for", meta.buyerName],
      ["Review", `${meta.tier === "expert" ? "Expert Review" : "Standard Review"}, ${fmtDate(meta.preparedOn)}, order ${meta.orderId.slice(0, 8)}`],
      ["Documents reviewed", `${meta.totalPages} pages in ${meta.fileCount} file${meta.fileCount === 1 ? "" : "s"} (section 19). Newest: ${ri.newest_document}, ${ri.newest_document_age}.`],
      ["Depreciation report", ri.depreciation_report],
      ["Management", ri.management],
      ["Scope", "A review of the documents provided only (section 20)."],
    ],
    [130, CONTENT_W - 130],
  );
  L.subheading("Overall assessment");
  L.tagged(report.overall.statement, TAG[report.overall.rating], "", 68, 10.5, bold);
  const areaName = { building: "Building and major projects", finances: "Finances and reserves", insurance_legal: "Insurance, legal and governance" } as const;
  for (const area of ["building", "finances", "insurance_legal"] as const) {
    const r = report.overall.areas.find((x) => x.area === area);
    if (!r) continue;
    L.tagged(`${areaName[area]}. ${r.why}${r.refs.length ? ` See section ${r.refs.join(", ")}.` : ""}`, TAG[r.rating], "", 68, 9.5);
  }
  L.text(`${RATING_LEGEND.red}  ${RATING_LEGEND.amber}  ${RATING_LEGEND.green}`, { size: 7.5, color: MUTED, gap: 4 });

  // ---------------------------------------------------------------- 3. Executive summary
  L.heading(H_(3));
  report.executive_summary.forEach((p) => L.text(p, { size: 10.5, gap: 6 }));

  // ---------------------------------------------------------------- 4. Before you remove subjects
  L.heading(H_(4));
  if (report.before_you_remove_subjects.length) numbered(report.before_you_remove_subjects.map((b) => `${b.action} ${b.why}${/[.!?]$/.test(b.why) ? "" : "."} (See section ${b.ref}.)`));
  else none("The review did not identify specific actions beyond the purchaser's usual due diligence.");

  // ---------------------------------------------------------------- 5. Top findings
  L.heading(H_(5));
  for (const f of byRating(report.top_findings)) {
    L.tagged(f.title, TAG[f.rating], "", 68, 10, bold);
    L.text(f.text, { x: M + 68, size: 9.5, gap: 1 });
    L.text(`Source: ${cite(f.pages) || "see detail"}. More in section ${f.ref}.`, { x: M + 68, size: 8, color: MUTED, gap: 7 });
  }

  // ---------------------------------------------------------------- 6. Key numbers
  L.heading(H_(6));
  const kn: string[][] = [];
  if (fig.monthly_fee) kn.push(["Strata fee for this lot", `${dollars2(fig.monthly_fee.amount)} a month`, `${fig.monthly_fee.as_of}; ${cite(fig.monthly_fee.pages)}`]);
  if (shareText && d.share) kn.push(["Unit entitlement", `${fig.lot_entitlement} of ${fig.total_entitlement!.toLocaleString("en-CA")}`, `This lot pays ${pct(d.share)} of strata-wide costs [derived]`]);
  if (fig.crf_balance) kn.push(["Contingency reserve fund (CRF)", money(fig.crf_balance.amount), `${fig.crf_balance.as_of}; ${cite(fig.crf_balance.pages)}`]);
  if (d.crfPerLot != null) kn.push(["CRF per lot", aboutDollars(d.crfPerLot), `CRF divided by ${fig.lots_total} lots [derived]`]);
  if (fig.annual_crf_contribution)
    kn.push(["Annual CRF contribution", money(fig.annual_crf_contribution.amount), `${fig.annual_crf_contribution.as_of}; ${cite(fig.annual_crf_contribution.pages)}`]);
  if (fig.recommended_contribution)
    kn.push([`Contribution, "${fig.recommended_contribution.scenario}" scenario`, money(fig.recommended_contribution.amount), `Depreciation report, first year; ${cite(fig.recommended_contribution.pages)}`]);
  if (d.forecast3yr) kn.push([`Forecast spending, ${d.forecast3yr.from} to ${d.forecast3yr.to}`, money(d.forecast3yr.amount), `Depreciation report; ${cite(d.forecast3yr.pages)}`]);
  if (d.coverage3yr != null) kn.push(["CRF against the next 3 years' forecast", pct(d.coverage3yr), "CRF divided by 3-year forecast [derived]"]);
  if (d.forecast10yrPerLot != null) kn.push(["10-year forecast spending per lot", aboutDollars(d.forecast10yrPerLot), `${money(d.forecast10yr ?? 0)} divided by ${fig.lots_total} lots [derived]`]);
  if (fig.operating_result)
    kn.push([`Operating ${fig.operating_result.amount < 0 ? "deficit" : "surplus"}`, money(Math.abs(fig.operating_result.amount)), `${fig.operating_result.period}; ${cite(fig.operating_result.pages)}`]);
  if (fig.water_deductible) kn.push(["Water damage deductible", money(fig.water_deductible.amount), `${fig.water_deductible.as_of}; ${cite(fig.water_deductible.pages)}`]);
  report.key_numbers_other.slice(0, 6).forEach((k) => kn.push([k.label, k.value, cite(k.pages)]));
  if (kn.length) L.table(["Measure", "Amount", "Source or basis"], kn, [190, 110, CONTENT_W - 300]);
  else none("The documents provided did not give the key financial figures; see section 16.");

  // ---------------------------------------------------------------- 7. Special levies
  L.heading(H_(7));
  const levyRows = report.levies.map((l) => ({ ...l, total: parseDollars(l.strata_total), year: firstYear(l.period) }));
  if (levyRows.length)
    L.table(
      ["Period", "Status", "Whole strata", "This lot (illustration)", "Source"],
      levyRows.map((l) => [
        l.period + (l.note ? `. ${l.note}` : ""),
        LEVY_STATUS[l.status],
        l.strata_total,
        l.total != null && d.share ? aboutDollars(l.total * d.share) : "unknown",
        cite(l.pages),
      ]),
      [150, 62, 88, 100, CONTENT_W - 400],
    );
  L.text(report.levy_comment, { size: 10, gap: 4 });
  const forecastSoon = levyRows.filter((l) => l.status === "forecast" && l.total != null && l.year != null && l.year >= today.getFullYear() && l.year <= today.getFullYear() + 2);
  const forecastSoonTotal = forecastSoon.reduce((a, l) => a + (l.total ?? 0), 0);
  const coo: string[][] = [];
  if (fig.monthly_fee && (forecastSoon.length || d.feeIfRecommended != null)) {
    if (forecastSoon.length)
      coo.push([
        "Current funding continues",
        `About ${dollars2(fig.monthly_fee.amount)}, plus annual increases`,
        d.share ? `${aboutDollars(forecastSoonTotal * d.share)} (forecast, not approved)` : `${money(forecastSoonTotal)} strata-wide`,
        "Depreciation report current-funding model [derived]",
      ]);
    if (d.feeIfRecommended != null && fig.recommended_contribution)
      coo.push([
        `"${fig.recommended_contribution.scenario}" funding adopted`,
        `${aboutDollars(d.feeIfRecommended)} a month`,
        "Lower; see section 11",
        `The CRF part of the fee goes from ${dollars2(d.lotMonthlyCrfNow ?? 0)} to ${aboutDollars(d.lotMonthlyCrfRecommended ?? 0)} [derived]`,
      ]);
    L.text(`What it could mean for this lot, ${today.getFullYear()} to ${today.getFullYear() + 2}`, { size: 9.5, font: bold, color: NAVY, gap: 2 });
    L.table(["If", "Monthly fee", "Levies", "Basis"], coo, [120, 120, 120, CONTENT_W - 360]);
  }
  L.text(
    [
      shareText ? `Shares use this lot's ${shareText}.` : "This lot's unit entitlement was not found, so its share can't be estimated; ask for the Schedule of Unit Entitlement.",
      "Illustrations only: the actual split depends on each levy resolution. Forecast levies are projections in the depreciation report, not decisions by owners.",
    ].join(" "),
    { size: 8.5, color: MUTED, gap: 6 },
  );

  // ---------------------------------------------------------------- 8. Form B
  L.heading(H_(8));
  if (report.form_b.length)
    L.table(
      ["Item", "Answer", "Rating", "Source"],
      byRating(report.form_b).map((f) => [f.item, f.answer, TAG[f.rating].label, cite(f.pages)]),
      [130, 250, 50, CONTENT_W - 430],
    );
  else none("No Form B Information Certificate was found in the documents provided. A current Form B is listed in section 16.");

  // ---------------------------------------------------------------- 9. Red flag check
  L.heading(H_(9));
  L.text("The 20 red flags from our Condo Buyers Guide, checked against the documents provided. RED: present; AMBER: partly present or a question to settle; GREEN: not shown in the documents reviewed.", {
    size: 8.5,
    color: MUTED,
    gap: 4,
  });
  const flagLabel = { present: "RED", partly: "AMBER", not_shown: "GREEN", not_checked: "Not checked" } as const;
  L.table(
    ["#", "Red flag", "Result", "See"],
    TOP_RED_FLAGS.map((flag, i) => {
      const r = report.red_flags.find((x) => x.n === i + 1);
      return [String(i + 1), flag, r ? `${flagLabel[r.status]}${r.note ? `: ${r.note}` : ""}` : "Not checked", r?.ref ?? ""];
    }),
    [20, 200, CONTENT_W - 260, 40],
  );

  // ---------------------------------------------------------------- 10 to 15. Analysis
  for (const id of ANALYSIS_IDS) {
    const n = analysisSection(id);
    const s = report.analysis.find((x) => x.id === id);
    L.heading(H_(n));
    if (!s) {
      none("The documents provided did not cover this area; see section 16.");
      continue;
    }
    L.text(`Reviewed: ${s.reviewed}`, { size: 8.5, color: MUTED, gap: 3 });
    L.text(s.conclusion, { size: 10, gap: 5 });
    if (id === "financial") {
      L.text(report.financial_interpretation, { size: 10, gap: 5 });
      if (fig.fee_history.length > 1)
        L.table(["Year", "This lot's monthly fee", "Source"], fig.fee_history.map((h) => [h.year, dollars2(h.monthly_fee), cite(h.pages)]), [120, 160, CONTENT_W - 280]);
    }
    if (id === "minutes" && report.issues.length) {
      L.text("Recurring and unresolved matters", { size: 9.5, font: bold, color: NAVY, gap: 2 });
      const status = { open: "Open", in_progress: "In progress", resolved: "Resolved", unknown: "Unknown" } as const;
      L.table(
        ["Matter", "First", "Last", "Status", "Cost", "Source"],
        report.issues.slice(0, 10).map((x) => [x.issue, x.first_recorded, x.last_recorded, `${status[x.status]}: ${x.status_note}`, x.cost ?? "Not stated", cite(x.pages)]),
        [118, 52, 52, 140, 60, CONTENT_W - 422],
      );
    }
    byRating(s.items).forEach((it) => L.tagged(it.text + (it.evidence === "interpretation" ? " (Our analysis.)" : ""), TAG[it.rating], cite(it.pages)));
    if (id === "other" && report.conflicts.length) {
      L.text("Where the documents disagree", { size: 9.5, font: bold, color: NAVY, gap: 2 });
      report.conflicts.forEach((c) => L.bullet(c.what, cite(c.pages)));
    }
  }

  // ---------------------------------------------------------------- 16. Documents to ask for
  L.heading(H_(16));
  if (report.documents_to_request.length) {
    L.text("Not found in the documents provided. A missing document does not mean there is a problem; these would help confirm the matters above.", { size: 8.5, color: MUTED, gap: 3 });
    numbered(report.documents_to_request.slice(0, 8).map((m) => `${m.document}: ${m.why}`));
  } else none("The documents provided cover the items normally reviewed.");

  // ---------------------------------------------------------------- 17. Questions
  L.heading(H_(17));
  if (report.questions.length) numbered(report.questions.slice(0, 10));
  else none("The review raised no follow-up questions beyond section 4.");

  // ---------------------------------------------------------------- 18. Related services
  L.heading(H_(18));
  const services = relatedServiceNotes(report.service_signals);
  if (services.length) {
    services.forEach((t) => L.bullet(t, ""));
  } else none("No related services are indicated by this review.");

  // ---------------------------------------------------------------- 19. Documents reviewed
  L.heading(H_(19));
  const dup = segments.filter((s) => /duplicate/i.test(s.title));
  const main = segments.filter((s) => !/duplicate/i.test(s.title) && (s.type !== "other" || s.end - s.start >= 2));
  const span = (s: Segment) => Array.from({ length: s.end - s.start + 1 }, (_, i) => s.start + i);
  L.table(
    ["Pages", "Document", "Type"],
    main.map((s) => [cite(span(s)), `${s.title}${s.superseded ? " (older version)" : ""}`, DOC_TYPE_LABEL[s.type]]),
    [110, 270, CONTENT_W - 380],
  );
  if (dup.length) L.text(`Duplicate copies, reviewed once: ${cite(dup.flatMap(span), 8)}.`, { size: 8.5, color: MUTED, gap: 6 });

  // ---------------------------------------------------------------- 20. Scope
  L.heading(H_(20));
  for (const [label, body] of scopeText(meta)) {
    L.text(label, { size: 9.5, font: bold, color: NAVY, gap: 1 });
    L.text(body, { size: 9, gap: 5 });
  }

  // ---------------------------------------------------------------- 21. Certification
  const statement = reviewedExpert ? reviewerStatement() : [];
  const lines = statement.reduce((n, c) => n + L.wrap(`- ${c}`, font, 9, CONTENT_W - 12).length, 0);
  L.ensure(lines * 9 * 1.38 + statement.length * 3 + 200);
  L.heading(H_(21));
  if (reviewedExpert) {
    L.text("I reviewed this report, its findings and its financial analysis before it was delivered, and I take professional responsibility for it. To the best of my knowledge and belief:", {
      size: 9.5,
      gap: 3,
    });
    statement.forEach((c) => L.text(`- ${c}`, { size: 9, x: M + 12, gap: 3 }));
    L.y -= 8;
    // A signature that can't be embedded must never stop a report; the typed name stays.
    const sig = meta.signaturePng
      ? await doc.embedPng(new Uint8Array(meta.signaturePng)).catch((err) => {
          console.error("signature could not be embedded", err);
          return null;
        })
      : null;
    if (sig) {
      const h = 40;
      const w = Math.min((sig.width / sig.height) * h, 200);
      L.page.drawImage(sig, { x: M, y: L.y - h, width: w, height: (w / sig.width) * sig.height });
      L.y -= h + 4;
    }
    L.text(founder.name, { size: 10.5, font: bold, color: NAVY });
    L.text("B.Comm., CRP (Real Estate Institute of Canada), DRP and DAR (Canadian National Association of Real Estate Appraisers)", { size: 9 });
    L.text(`Report date: ${fmtDate(meta.preparedOn)}.`, { size: 8.5, color: MUTED, gap: 6 });
  } else if (meta.professionallyReviewed) {
    L.text(
      `Before delivery, ${founder.name} checked the key figures, special levies and Top Findings in this report against their source pages. A Standard Review does not receive the full professional review and signed certification of an Expert Review.`,
      { size: 9.5, gap: 3 },
    );
    L.text(`${founder.name}, ${founder.designations}. Report date: ${fmtDate(meta.preparedOn)}.`, { size: 9, gap: 6 });
  } else {
    L.text(
      "This Standard report was produced by the Condo Wise Guys review process and was not checked by a person before delivery, so it carries no professional certification. An Expert Review includes a full review and signed certification.",
      { size: 9.5, gap: 6 },
    );
  }

  L.y -= 6;
  L.text(
    `Condo Wise Guys is owned by ${founder.name}, ${founder.designations}: ${founder.summary.charAt(0).toLowerCase()}${founder.summary.slice(1)} Questions about this report: ${meta.contactEmail}. Order reference ${meta.orderId.slice(0, 8)}.`,
    { size: 8.5, color: MUTED },
  );

  // ---- Footers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const left = L.clean(`Condo Wise Guys  |  ${meta.propertyAddress}`, font).slice(0, 90);
    p.drawRectangle({ x: M, y: 40, width: CONTENT_W, height: 0.6, color: RULE });
    p.drawText(left, { x: M, y: 28, size: 8, font, color: MUTED });
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawText(right, { x: W - M - font.widthOfTextAtSize(right, 8), y: 28, size: 8, font, color: MUTED });
    p.drawText(L.clean(reviewScope.line, font), { x: M, y: 17, size: 7, font, color: MUTED });
  });

  return doc.save();
}
