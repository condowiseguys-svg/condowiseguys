// @cantoo/pdf-lib is a pdf-lib fork that can decrypt. Many strata packages are "secured"
// PDFs; copying their pages with plain pdf-lib produces blank pages.
import { PDFDocument } from "@cantoo/pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod/v4";
import type { ManifestEntry } from "@/lib/ops/records";
import Anthropic from "@anthropic-ai/sdk";
import { askForJson, ocrModel } from "./claude";
import { mapLimit } from "./pool";

/** One page of the package. `doc` is the file's position in the manifest (0-based). */
export type PageText = { doc: number; page: number; text: string; source: "text" | "ocr" | "unreadable" };

/**
 * Pages with less real text than this are treated as scans and read by Claude. Set high
 * enough that a scanned page carrying only a filing header (e.g. Land Title Office strata
 * plan pages) is still read.
 */
const MIN_TEXT_CHARS = 200;
/** Scanned pages sent to Claude per request. */
const OCR_BATCH = 8;
/** OCR requests running at the same time. */
const OCR_PARALLEL = 4;

export function isImageFile(name: string) {
  return /\.(jpe?g|png)$/i.test(name);
}

/** Pulls the text layer out of a PDF, one string per page. */
export async function pdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  await pdf.cleanup();
  return text.map((t) => t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
}

export function needsOcr(text: string) {
  return text.replace(/\s+/g, "").length < MIN_TEXT_CHARS;
}

const OcrSchema = z.object({
  pages: z.array(
    z.object({
      index: z.number().describe("1-based position of the page in the attached PDF"),
      text: z.string().describe("Full transcription of the page"),
    }),
  ),
});

const OCR_SYSTEM = `You transcribe scanned pages from British Columbia strata (condominium) documents so they can be reviewed later.
Transcribe every page completely and accurately: headings, body text, numbers, dates, dollar amounts, names of companies, signatures as [signature], stamps as [stamp: text].
Write tables one row per line with cells separated by " | ". Describe charts or photos in one short bracketed line, including any numbers shown, e.g. [bar chart: CRF balance 2024 $1.2M rising to $3.4M in 2030].
If a page is blank or unreadable, say so in brackets. Do not summarize and do not add commentary.`;

/** Opens a PDF so its pages can be copied, decrypting secured PDFs (empty user password). */
export async function openForCopy(bytes: Uint8Array) {
  try {
    return await PDFDocument.load(bytes, { password: "", updateMetadata: false });
  } catch {
    // Not encrypted in a way the decryptor understands: copy as is.
    return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  }
}

/** Builds a small PDF holding just the given pages (1-based) of the source PDF. */
async function subsetPdf(src: PDFDocument, pages: number[]) {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(
    src,
    pages.map((p) => p - 1),
  );
  copied.forEach((p) => out.addPage(p));
  return out.save();
}

/**
 * Reads scanned pages with Claude, a few pages per request. Each batch has its own cost
 * key, so a retry never double counts.
 */
export async function ocrPdfPages(opts: {
  orderId: string;
  submission: number;
  docIndex: number;
  bytes: Uint8Array;
  pages: number[];
}): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (!opts.pages.length) return result;
  const src = await openForCopy(opts.bytes);

  const batches: number[][] = [];
  for (let i = 0; i < opts.pages.length; i += OCR_BATCH) batches.push(opts.pages.slice(i, i + OCR_BATCH));

  await mapLimit(batches, OCR_PARALLEL, async (batch) => {
    let data: string;
    try {
      data = Buffer.from(await subsetPdf(src, batch)).toString("base64");
    } catch (err) {
      for (const p of batch) result.set(p, `[page could not be extracted for reading: ${String(err).slice(0, 80)}]`);
      return;
    }
    const answer = await askOrSkip({
      orderId: opts.orderId,
      step: "Read scanned pages",
      costKey: `claude:ocr:${opts.orderId}:s${opts.submission}:d${opts.docIndex}:p${batch[0]}-${batch[batch.length - 1]}`,
      schema: OcrSchema,
      system: OCR_SYSTEM,
      model: ocrModel(),
      effort: "low",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: `Transcribe all ${batch.length} pages of the attached PDF. Return one entry per page, index 1 to ${batch.length}.` },
      ],
    });
    // Pages Claude couldn't take (e.g. too large) stay unread and are listed in the report.
    for (const p of answer?.pages ?? []) {
      const real = batch[p.index - 1];
      if (real !== undefined) result.set(real, p.text.trim());
    }
  });
  return result;
}

/**
 * Claude refuses a request it considers invalid (HTTP 400), for example an image over its
 * size limit. Retrying can't help, so the pages are left unread (the report lists them for a
 * check by hand) instead of failing the whole order.
 */
async function askOrSkip(opts: Parameters<typeof askForJson<typeof OcrSchema>>[0]) {
  try {
    return await askForJson(opts);
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      console.error(`Claude could not read ${opts.costKey}: ${err.message}`);
      return null;
    }
    throw err;
  }
}

/** Photos above this go to Claude inside a one-page PDF, which has no 10 MB or pixel-size cap. */
const MAX_DIRECT_IMAGE_BYTES = 3.5 * 1024 * 1024;

/** Puts a photo on a single PDF page sized to it. */
async function imageToPdf(bytes: Uint8Array, mediaType: "image/jpeg" | "image/png") {
  const doc = await PDFDocument.create();
  // A fresh copy: pdf-lib reads the whole underlying buffer and ignores a Buffer's offset.
  const copy = new Uint8Array(bytes);
  const image = mediaType === "image/png" ? await doc.embedPng(copy) : await doc.embedJpg(copy);
  // Cap the page at 14 x 14 inches; the photo keeps its full resolution inside it.
  const scale = Math.min(1, 1008 / Math.max(image.width, image.height));
  const page = doc.addPage([image.width * scale, image.height * scale]);
  page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
  return doc.save();
}

/** Reads an uploaded photo of a page (JPEG or PNG). Returns null if it couldn't be read. */
export async function ocrImage(opts: {
  orderId: string;
  submission: number;
  docIndex: number;
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png";
}): Promise<string | null> {
  let source: Anthropic.ContentBlockParam;
  if (opts.bytes.length > MAX_DIRECT_IMAGE_BYTES) {
    let pdf: Uint8Array;
    try {
      pdf = await imageToPdf(opts.bytes, opts.mediaType);
    } catch (err) {
      console.error("could not wrap photo in a PDF", err);
      return null;
    }
    source = { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } };
  } else {
    source = { type: "image", source: { type: "base64", media_type: opts.mediaType, data: Buffer.from(opts.bytes).toString("base64") } };
  }
  const answer = await askOrSkip({
    orderId: opts.orderId,
    step: "Read scanned pages",
    costKey: `claude:ocr:${opts.orderId}:s${opts.submission}:d${opts.docIndex}:img`,
    schema: OcrSchema,
    system: OCR_SYSTEM,
    model: ocrModel(),
    effort: "low",
    content: [source, { type: "text", text: "Transcribe this page. Return one entry with index 1." }],
  });
  return answer ? answer.pages.map((p) => p.text).join("\n\n") : null;
}

/** Every page of one file, with scans read by Claude. */
export async function extractDocument(opts: {
  orderId: string;
  submission: number;
  docIndex: number;
  doc: ManifestEntry;
  bytes: Uint8Array;
}): Promise<PageText[]> {
  const { doc, bytes, docIndex } = opts;
  if (isImageFile(doc.file_name)) {
    const mediaType = /\.png$/i.test(doc.file_name) ? "image/png" : "image/jpeg";
    const text = await ocrImage({ ...opts, mediaType });
    return text
      ? [{ doc: docIndex, page: 1, text, source: "ocr" }]
      : [{ doc: docIndex, page: 1, text: "[scanned page that could not be read]", source: "unreadable" }];
  }

  let texts: string[];
  try {
    texts = await pdfPageTexts(bytes);
  } catch {
    // No usable text layer at all (e.g. damaged structure): read every page as a scan.
    const count = doc.page_count ?? (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
    texts = Array.from({ length: count }, () => "");
  }

  const scanned = texts.map((t, i) => (needsOcr(t) ? i + 1 : 0)).filter(Boolean);
  const ocr = await ocrPdfPages({ ...opts, pages: scanned });
  return texts.map((t, i) => {
    const page = i + 1;
    if (!needsOcr(t)) return { doc: docIndex, page, text: t, source: "text" as const };
    const read = ocr.get(page);
    return read
      ? { doc: docIndex, page, text: read, source: "ocr" as const }
      : { doc: docIndex, page, text: "[scanned page that could not be read]", source: "unreadable" as const };
  });
}
