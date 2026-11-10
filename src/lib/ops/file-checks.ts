import { PDFDocument } from "pdf-lib";

export type FileCheck = {
  status: "ok" | "unreadable" | "empty";
  pageCount: number | null;
  detail: string | null;
};

function startsWith(bytes: Uint8Array, sig: number[]) {
  return sig.every((b, i) => bytes[i] === b);
}

/**
 * Basic readability check before analysis. Scanned (image-only) pages are fine here:
 * they are handled by OCR later. This only catches files we can't open at all.
 * Secured PDFs (edit or print restrictions) are accepted and noted.
 */
export async function checkFile(bytes: Uint8Array, mime: string): Promise<FileCheck> {
  if (bytes.length === 0) return { status: "empty", pageCount: 0, detail: "The file is empty." };

  if (mime === "image/jpeg" || mime === "image/png") {
    const ok = mime === "image/jpeg" ? startsWith(bytes, [0xff, 0xd8, 0xff]) : startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
    return ok
      ? { status: "ok", pageCount: 1, detail: null }
      : { status: "unreadable", pageCount: null, detail: "The image file is damaged or not really an image." };
  }

  // %PDF can appear a little after the start in some generators.
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) {
    return { status: "unreadable", pageCount: null, detail: "This is not a valid PDF file." };
  }

  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPageCount();
    if (pages === 0) return { status: "empty", pageCount: 0, detail: "The PDF has no pages." };
    return { status: "ok", pageCount: pages, detail: doc.isEncrypted ? "Secured PDF (restrictions noted)" : null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unreadable", pageCount: null, detail: `The PDF could not be opened (${msg.slice(0, 120)}).` };
  }
}
