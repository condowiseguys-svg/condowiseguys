import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { founder, reviewScope } from "@/lib/site";
import { DOC_TYPE_LABEL, TOP_RED_FLAGS } from "./checklist";
import type { Segment } from "./classify";
import { AREA_IDS, AREA_TITLES, DETAIL_IDS, DETAIL_TITLES, areaRef, detailRef, type Report } from "./compose";
import { aboutDollars, deriveMetrics, money, parseDollars } from "./derive";
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
const HIGH = rgb(0.72, 0.15, 0.15);
const MODERATE = rgb(0.78, 0.48, 0.03);
const LOW = rgb(0.1, 0.5, 0.32);
const ROUTINE = rgb(0.45, 0.49, 0.55);

const TAG = {
  high: { label: "High", color: HIGH },
  moderate: { label: "Moderate", color: MODERATE },
  low: { label: "Low", color: LOW },
  routine: { label: "Routine", color: ROUTINE },
} satisfies Record<string, Tag>;

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
    drawRow(headers, this.bold, MUTED);
    for (const r of rows) drawRow(r, this.font, TEXT);
    this.y -= 8;
  }
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Vancouver" });
}

const dollars2 = (n: number) => `$${n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (x: number) => `about ${x < 0.1 ? (Math.round(x * 1000) / 10).toFixed(1).replace(/\.0$/, "") : Math.round(x * 100)}%`;
const firstYear = (s: string) => {
  const m = s.match(/\b(20\d\d)\b/);
  return m ? Number(m[1]) : null;
};

/** Each item of the Appendix D scope text: a bold lead-in, then the body. */
export function scopeText(meta: Pick<ReportMeta, "buyerName" | "propertyAddress" | "unitNumber" | "strataPlan" | "ocrPages" | "professionallyReviewed" | "tier" | "totalPages">) {
  const lot = [meta.unitNumber ? `unit ${meta.unitNumber}` : null, meta.propertyAddress, meta.strataPlan ? `strata plan ${meta.strataPlan}` : null]
    .filter(Boolean)
    .join(", ");
  const check =
    meta.tier === "expert" && meta.professionallyReviewed
      ? `${founder.name} reviewed the findings, the financial analysis and this report before delivery (Appendix E).`
      : meta.professionallyReviewed
        ? `Before delivery, ${founder.name} checked this report's key figures against their source pages. A Standard report does not receive a full professional review; you can upgrade to an Expert Review with full credit for what you paid.`
        : "This Standard report was produced by our review process and was not checked by a person before delivery.";
  return [
    [
      "Purpose",
      `This report was prepared for ${meta.buyerName} to help them understand the strata documents for ${lot} before deciding on a purchase. They may share it with their lawyer, notary, realtor or lender, but no one else may rely on it, and it is not intended for lending, valuation, insurance or litigation.`,
    ],
    [
      "What we did",
      `We read all ${meta.totalPages} pages provided${meta.ocrPages ? `, including ${meta.ocrPages} scanned pages read by text recognition` : ""}. AI software read the documents, extracted figures and drafted findings against our BC strata checklist. Figures marked "derived" were calculated by our software from the cited figures, by the method shown. ${check}`,
    ],
    [
      "What we did not do",
      `We did not contact the strata corporation, its manager, its council or the seller, search title, or check the documents against any other source. ${reviewScope.full.join(" ")}`,
    ],
    [
      "Relying on the documents",
      "Findings depend on the documents being authentic, accurate and current. Information is as of each document's date; anything after the newest document, or outside the package, is not covered.",
    ],
    [
      "Estimates",
      "Unit shares are illustrations based on unit entitlement; the actual share depends on each levy resolution and, in a sectioned strata, on which section pays. Depreciation report figures are its author's projections, not decisions by owners. Nothing in this report guarantees future costs.",
    ],
    [
      "Not advice",
      "Comments on bylaws, legal matters, building condition and insurance identify questions to take to a lawyer or notary, an inspector or engineer, or an insurance broker. This review does not recommend whether to buy, and no opinion of value is given.",
    ],
    [
      "Accuracy promise",
      "Text recognition and AI can misread figures. If you find a figure that doesn't match its cited page, tell us and we will correct the report at no charge.",
    ],
  ] as [string, string][];
}

/** The signed Reviewer's statement on a reviewed Expert report. */
export function reviewerStatement() {
  return [
    "The facts reported are accurately taken from the documents provided, and the source of each is cited.",
    "The analysis and conclusions are my own impartial professional opinions, limited by the scope and conditions in Appendix D.",
    "I have no present or prospective interest in this property and no personal interest in the parties.",
    "My fee does not depend on the findings, on whether the purchase completes, or on any later event.",
    "In the three years before this report I performed no services regarding this strata lot or its strata corporation, in any capacity.",
    "I did not inspect the property.",
    "AI software assisted in reading the documents and drafting this report under my direction.",
  ];
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
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
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

  // ---------------------------------------------------------------- 1. At a glance
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
  L.y = H - 134;
  L.text(`Prepared for ${meta.buyerName}. ${meta.totalPages} pages reviewed in ${meta.fileCount} file${meta.fileCount === 1 ? "" : "s"}.`, {
    size: 8.5,
    color: MUTED,
    gap: 4,
  });

  L.box(
    "What this review is",
    "A professional review of the strata documents provided for this unit. We read every page, identify what could materially affect your costs, risks and use of the home, and cite the source of each finding. It is based on documents only: we did not inspect the building, contact the strata or verify the documents. It is not an appraisal, inspection, engineering assessment, legal opinion or insurance advice, and it does not recommend whether to buy. See Appendix D.",
  );

  const snap = report.snapshot;
  L.text([snap.building, snap.construction, snap.lots, snap.management, `Depreciation report: ${snap.depreciation_report}`].join("  |  "), { size: 9.5, gap: 2 });
  L.text(`Newest document: ${snap.newest_document} (${snap.newest_document_age})`, { size: 9.5, font: bold, color: NAVY, gap: 6 });

  L.subheading("Risk profile");
  const areaName = { building: "Building and capital plans", finances: "Finances and reserves", insurance_legal: "Insurance, legal and governance" } as const;
  for (const area of ["building", "finances", "insurance_legal"] as const) {
    const r = report.risk_profile.find((x) => x.area === area);
    if (!r) continue;
    L.tagged(`${areaName[area]}. ${r.why}${r.refs.length ? ` See ${r.refs.join(", ")}.` : ""}`, TAG[r.level], "", 68, 9.5);
  }

  L.subheading("Your potential cost exposure");
  const levyRows = report.levies.map((l) => ({ ...l, total: parseDollars(l.strata_total), year: firstYear(l.period) }));
  const forecastSoon = levyRows.filter((l) => l.status === "forecast" && l.total != null && l.year != null && l.year >= today.getFullYear() && l.year <= today.getFullYear() + 2);
  const forecastSoonTotal = forecastSoon.reduce((a, l) => a + (l.total ?? 0), 0);
  const pendingApproved = levyRows.filter((l) => l.status !== "forecast" && (l.year == null || l.year >= today.getFullYear()));
  const exposure: string[][] = [
    [
      "Strata fee now",
      fig.monthly_fee ? `${dollars2(fig.monthly_fee.amount)} a month` : "Not in package",
      fig.monthly_fee ? fig.monthly_fee.as_of : "Ask for the current fee schedule",
    ],
    [
      "Levies approved or proposed",
      pendingApproved.length ? pendingApproved.map((l) => l.strata_total + " strata-wide").join("; ") : "None found",
      `As of the newest document (${snap.newest_document_age}); see 4.2`,
    ],
  ];
  if (forecastSoon.length)
    exposure.push([
      `Levies forecast, ${today.getFullYear()} to ${today.getFullYear() + 2}`,
      d.share ? `${aboutDollars(forecastSoonTotal * d.share)} for this lot` : `${money(forecastSoonTotal)} strata-wide; this lot's share unknown`,
      `Depreciation report projection, not a vote${shareText ? `; ${shareText}` : ""} [derived]`,
    ]);
  if (d.feeIfRecommended != null && fig.recommended_contribution && fig.monthly_fee)
    exposure.push([
      `Fee if reserves are funded as the report's "${fig.recommended_contribution.scenario}" scenario`,
      `${aboutDollars(d.feeIfRecommended)} a month`,
      `The CRF part goes from ${dollars2(d.lotMonthlyCrfNow ?? 0)} to ${aboutDollars(d.lotMonthlyCrfRecommended ?? 0)} [derived]; see 4.2`,
    ]);
  if (fig.water_deductible)
    exposure.push(["Deductible you could be charged", `Up to ${money(fig.water_deductible.amount)}`, "If a water loss starts in your unit; ask your insurance broker; see 3.3"]);
  L.table(["Item", "Amount", "Basis"], exposure, [150, 150, CONTENT_W - 300]);

  L.subheading("What matters most");
  report.top_issues.slice(0, 5).forEach((t, i) => L.text(`${i + 1}. ${t.text} (${t.ref})`, { x: M + 10, size: 9.5, gap: 2 }));
  // ---------------------------------------------------------------- 2. Executive summary
  L.newPage();
  L.heading("2. Executive summary");
  L.text(report.summary.picture, { size: 10.5, gap: 6 });
  L.text(report.summary.second_tier, { size: 10.5, gap: 6 });
  L.text(`What we can't tell from these documents: ${report.summary.unknowns}`, { size: 10.5, font: bold, color: NAVY, gap: 8 });

  // ---------------------------------------------------------------- 3. Key findings
  L.heading("3. Key findings");
  L.text("High and moderate matters only. Routine matters are in section 6.", { size: 8.5, color: MUTED, gap: 4 });
  const areaDetail: Record<(typeof AREA_IDS)[number], string> = {
    building: `${detailRef("minutes")} and ${detailRef("engineering")}`,
    capital: detailRef("depreciation"),
    insurance: detailRef("insurance"),
    legal: detailRef("legal"),
    governance: detailRef("minutes"),
    bylaws: detailRef("bylaws"),
    other: detailRef("regional"),
  };
  for (const area of AREA_IDS) {
    const fs = report.findings.filter((f) => f.area === area).sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "high" ? -1 : 1));
    L.subheading(`${areaRef(area)} ${AREA_TITLES[area]}`);
    if (!fs.length) {
      L.text(`No material concerns found in the documents reviewed. See ${areaDetail[area]}.`, { size: 9.5, color: MUTED, gap: 4 });
      continue;
    }
    for (const f of fs) {
      L.tagged(f.title, TAG[f.priority], "", 68, 10, bold);
      L.text(`What the documents show: ${f.shows}`, { x: M + 68, size: 9.5, gap: 1 });
      if (f.why_it_matters) L.text(`Why it matters: ${f.why_it_matters}`, { x: M + 68, size: 9.5, font: italic, gap: 1 });
      L.text(`Ask: ${f.ask}`, { x: M + 68, size: 9.5, gap: 1 });
      const src = cite(f.pages);
      L.text(`Source: ${src || "see detail"}${f.detail ? `. More in ${f.detail}.` : ""}`, { x: M + 68, size: 8, color: MUTED, gap: 7 });
    }
  }
  if (report.lifestyle_checks.length) {
    L.text("Check against your plans (not rated): bylaws and rules on how the home can be used.", { size: 9.5, font: bold, color: NAVY, gap: 2 });
    report.lifestyle_checks.forEach((c) => L.bullet(c.text, cite(c.pages)));
  }

  // ---------------------------------------------------------------- 4. Financial and capital planning
  L.heading("4. Financial and capital planning");
  L.subheading("4.1 Reserve position");
  const rows: string[][] = [];
  if (fig.crf_balance) rows.push(["Contingency reserve fund (CRF)", money(fig.crf_balance.amount), `${fig.crf_balance.as_of}; ${cite(fig.crf_balance.pages)}`]);
  if (d.crfPerLot != null) rows.push(["CRF per lot", aboutDollars(d.crfPerLot), `CRF divided by ${fig.lots_total} lots [derived]`]);
  if (d.forecast3yr)
    rows.push([`Forecast spending, ${d.forecast3yr.from} to ${d.forecast3yr.to}`, money(d.forecast3yr.amount), `Depreciation report; ${cite(d.forecast3yr.pages)}`]);
  if (d.coverage3yr != null) rows.push(["Reserves against the next 3 years' forecast", pct(d.coverage3yr), "CRF divided by 3-year forecast [derived]"]);
  if (d.forecast10yrPerLot != null) rows.push(["10-year forecast spending per lot", aboutDollars(d.forecast10yrPerLot), `${money(d.forecast10yr ?? 0)} divided by ${fig.lots_total} lots [derived]`]);
  if (fig.annual_crf_contribution)
    rows.push(["Annual CRF contribution now", money(fig.annual_crf_contribution.amount), `${fig.annual_crf_contribution.as_of}; ${cite(fig.annual_crf_contribution.pages)}`]);
  if (fig.recommended_contribution)
    rows.push([`Contribution in the "${fig.recommended_contribution.scenario}" scenario`, money(fig.recommended_contribution.amount), cite(fig.recommended_contribution.pages)]);
  if (rows.length) L.table(["Measure", "Value", "Source or basis"], rows, [190, 110, CONTENT_W - 300]);
  else L.text("The documents provided did not give the reserve figures needed for this analysis.", { color: MUTED, gap: 4 });
  L.text(report.financial.reserve_interpretation, { size: 10, gap: 6 });

  L.subheading("4.2 Cost of ownership outlook for this lot");
  const coo: string[][] = [];
  if (fig.monthly_fee) coo.push(["Today", `${dollars2(fig.monthly_fee.amount)} a month`, pendingApproved.length ? "See levies below" : "None approved in the documents", fig.monthly_fee.as_of]);
  if (forecastSoon.length)
    coo.push([
      "Current funding continues",
      fig.monthly_fee ? `About ${dollars2(fig.monthly_fee.amount)}, plus annual increases` : "Not known",
      d.share ? `${aboutDollars(forecastSoonTotal * d.share)} (forecast)` : `${money(forecastSoonTotal)} strata-wide`,
      "Depreciation report current-funding model [derived]",
    ]);
  if (d.feeIfRecommended != null && fig.recommended_contribution)
    coo.push([`"${fig.recommended_contribution.scenario}" funding adopted`, `${aboutDollars(d.feeIfRecommended)} a month`, "Lower; see the depreciation report", "First-year contribution by entitlement [derived]"]);
  if (coo.length) L.table(["Scenario", "Monthly fee", "Levies, next 3 years", "Basis"], coo, [120, 120, 120, CONTENT_W - 360]);
  if (report.levies.length) {
    L.text("Special levies: approved, proposed and forecast", { size: 9.5, font: bold, color: NAVY, gap: 2 });
    L.table(
      ["Period", "Status", "Whole strata", "This lot (illustration)", "Source"],
      levyRows.map((l) => [
        l.period + (l.note ? `. ${l.note}` : ""),
        l.status,
        l.strata_total,
        l.total != null && d.share ? aboutDollars(l.total * d.share) : "unknown",
        cite(l.pages),
      ]),
      [150, 58, 92, 100, CONTENT_W - 400],
    );
  }
  L.text(
    [
      shareText ? `Shares use this lot's ${shareText}.` : "This lot's unit entitlement was not found, so its share can't be estimated; ask for the Schedule of Unit Entitlement.",
      report.levy_basis_note,
      "Illustrations only: the actual split depends on each levy resolution.",
    ]
      .filter(Boolean)
      .join(" "),
    { size: 8.5, color: MUTED, gap: 6 },
  );

  if (fig.fee_history.length || fig.operating_result) {
    L.subheading("4.3 Trends");
    if (fig.fee_history.length) L.table(["Year", "This lot's monthly fee", "Source"], fig.fee_history.map((h) => [h.year, `$${h.monthly_fee.toFixed(2)}`, cite(h.pages)]), [120, 160, CONTENT_W - 280]);
    if (fig.operating_result)
      L.text(`Operating result: ${fig.operating_result.amount < 0 ? "deficit" : "surplus"} of ${money(Math.abs(fig.operating_result.amount))}, ${fig.operating_result.period} (${cite(fig.operating_result.pages)}).`, { size: 9.5, gap: 3 });
    L.text(report.financial.trend_interpretation, { size: 10, gap: 6 });
  }
  const other = report.financial.other_items.filter((x) => x.priority !== "routine");
  if (other.length) {
    L.subheading("4.4 Operating fund and other obligations");
    other.forEach((it) => L.tagged(it.text, TAG[it.priority], cite(it.pages)));
  }

  // ---------------------------------------------------------------- 5. Before you remove subjects
  L.heading("5. Before you remove subjects");
  L.subheading("5.1 Documents to request");
  if (report.documents_to_request.length) report.documents_to_request.slice(0, 8).forEach((m, i) => L.text(`${i + 1}. ${m.document}: ${m.why}`, { x: M + 10, size: 9.5, gap: 2 }));
  else L.text("The documents provided cover the items we normally review.", { size: 9.5, gap: 2 });
  L.subheading("5.2 Questions for the strata manager");
  report.questions.slice(0, 8).forEach((q, i) => L.text(`${i + 1}. ${q}`, { x: M + 10, size: 9.5, gap: 2 }));
  if (report.who_to_ask.length) {
    L.subheading("5.3 Who to ask about what");
    const who = new Map<string, string[]>();
    report.who_to_ask.forEach((w) => who.set(w.who, [...(who.get(w.who) ?? []), w.about]));
    for (const [w, abouts] of who) L.text(`${w.charAt(0).toUpperCase()}${w.slice(1)}: ${abouts.join("; ")}`, { x: M + 10, size: 9.5, gap: 2 });
  }

  // ---------------------------------------------------------------- 6. Detailed analysis
  L.heading("6. Detailed analysis");
  for (const id of DETAIL_IDS) {
    const s = report.details.find((x) => x.id === id);
    L.subheading(`${detailRef(id)} ${DETAIL_TITLES[id]}`);
    if (!s) {
      L.text("The documents provided did not cover this area.", { size: 9.5, color: MUTED, gap: 4 });
      continue;
    }
    L.text(s.reviewed, { size: 9.5, color: MUTED, gap: 4 });
    if (id === "minutes" && report.issues.length) {
      L.text("Issue tracker: recurring matters across meetings", { size: 9.5, font: bold, color: NAVY, gap: 2 });
      const status = { open: "Open", in_progress: "In progress", resolved: "Resolved", unknown: "Unknown" } as const;
      L.table(
        ["Issue", "First", "Last", "Status", "Cost", "Source"],
        report.issues.slice(0, 10).map((x) => [x.issue, x.first_recorded, x.last_recorded, `${status[x.status]}: ${x.status_note}`, x.cost ?? "Not stated", cite(x.pages)]),
        [118, 52, 52, 140, 60, CONTENT_W - 422],
      );
    }
    const order = { high: 0, moderate: 1, routine: 2 } as const;
    [...s.items].sort((a, b) => order[a.priority] - order[b.priority]).forEach((it) => L.tagged(it.text + (it.evidence === "interpretation" ? " (Our interpretation.)" : ""), TAG[it.priority], cite(it.pages)));
    if (s.routine_summary) L.text(`Routine matters: ${s.routine_summary}`, { size: 9, color: MUTED, gap: 6 });
  }

  // ---------------------------------------------------------------- Appendices
  L.newPage();
  L.heading("Appendix A. Form B summary");
  if (report.form_b.length) {
    const follow = report.form_b.filter((f) => f.follow_up);
    const plain = report.form_b.filter((f) => !f.follow_up);
    if (follow.length) L.table(["Item", "Answer (needs follow-up)", "Source"], follow.map((f) => [f.item, f.answer, cite(f.pages)]), [140, 270, CONTENT_W - 410]);
    if (plain.length) L.text(`No follow-up needed: ${plain.map((f) => `${f.item}: ${f.answer}`).join("; ")}.`, { size: 9, color: MUTED, gap: 6 });
  } else {
    L.text("No Form B Information Certificate was found in the package. Ask the seller for a current Form B before removing subjects.", { size: 9.5, gap: 6 });
  }

  L.heading("Appendix B. Red flag checklist");
  L.text("The 20 red flags from our Condo Buyers Guide (Part 12.2), checked against the documents provided.", { size: 8.5, color: MUTED, gap: 4 });
  const flagLabel = { present: "Present", partly: "Partly", not_shown: "Not shown", not_checked: "Not checked" } as const;
  L.table(
    ["#", "Red flag", "Finding", "See"],
    TOP_RED_FLAGS.map((flag, i) => {
      const r = report.red_flags.find((x) => x.n === i + 1);
      return [String(i + 1), flag, r ? `${flagLabel[r.status]}${r.status === "present" || r.status === "partly" ? `: ${r.note}` : ""}` : "Not checked", r?.ref ?? ""];
    }),
    [20, 200, CONTENT_W - 260, 40],
  );

  L.heading("Appendix C. Conflicts and gaps");
  if (report.conflicts.length) {
    L.text("Where documents disagree:", { size: 9.5, font: bold, color: NAVY, gap: 2 });
    report.conflicts.forEach((c) => L.bullet(c.what, cite(c.pages)));
  }
  if (report.documents_to_request.length) {
    L.text("Not found in the documents provided (they may exist under another name):", { size: 9.5, font: bold, color: NAVY, gap: 2 });
    report.documents_to_request.forEach((m) => L.bullet(`${m.document}. ${m.why}`, ""));
  }
  if (!report.conflicts.length && !report.documents_to_request.length) L.text("No conflicts between documents or important gaps were found.", { size: 9.5, gap: 4 });

  L.heading("Appendix D. Scope, method and limitations");
  for (const [label, body] of scopeText(meta)) {
    L.text(label, { size: 9.5, font: bold, color: NAVY, gap: 1 });
    L.text(body, { size: 9, gap: 5 });
  }

  if (reviewedExpert) {
    const statement = reviewerStatement();
    const lines = statement.reduce((n, c) => n + L.wrap(`- ${c}`, font, 9, CONTENT_W - 12).length, 0);
    L.ensure(lines * 9 * 1.38 + statement.length * 3 + 220);
    L.heading("Appendix E. Reviewer's statement");
    L.text("I reviewed this report, its findings and its financial analysis before it was delivered, and I take professional responsibility for it. To the best of my knowledge:", {
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
    L.text(`Report date: ${fmtDate(meta.preparedOn)}. This review is not an appraisal, and no opinion of value is given.`, { size: 8.5, color: MUTED, gap: 6 });
  }

  L.heading(`Appendix ${reviewedExpert ? "F" : "E"}. Documents reviewed`);
  const dup = segments.filter((s) => /duplicate/i.test(s.title));
  const main = segments.filter((s) => !/duplicate/i.test(s.title) && (s.type !== "other" || s.end - s.start >= 2));
  const span = (s: Segment) => Array.from({ length: s.end - s.start + 1 }, (_, i) => s.start + i);
  L.table(
    ["Pages", "Document", "Type"],
    main.map((s) => [cite(span(s)), `${s.title}${s.superseded ? " (older version)" : ""}`, DOC_TYPE_LABEL[s.type]]),
    [110, 270, CONTENT_W - 380],
  );
  if (dup.length) L.text(`Duplicate copies, reviewed once: ${cite(dup.flatMap(span), 8)}.`, { size: 8.5, color: MUTED, gap: 6 });

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
