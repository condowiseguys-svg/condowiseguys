import { getDocumentProxy } from "unpdf";
import { checkFile, type FileCheck } from "@/lib/ops/file-checks";
import { sha256 } from "@/lib/ops/hash";
import { categorizeDocument } from "./categorize";
import { CONTENT_TYPES, type UploadKind } from "./limits";

export type Inspection = FileCheck & {
  sha256: string;
  size: number;
  category: string;
};

const ACTIVE_MARKERS = ["/JavaScript", "/Launch", "/EmbeddedFile"].map((m) => Buffer.from(m, "latin1"));

/** True if a PDF carries scripts, launch actions or attached files. We never run or open them. */
function hasActiveContent(bytes: Uint8Array) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return ACTIVE_MARKERS.some((m) => buf.indexOf(m) !== -1);
}

/** Text of the first couple of pages, for labelling the document. Empty for scans. */
async function firstPagesText(bytes: Uint8Array, pages = 2) {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const parts: string[] = [];
    for (let i = 1; i <= Math.min(pages, pdf.numPages); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    await pdf.cleanup();
    return parts.join("\n");
  } catch {
    return "";
  }
}

/**
 * Checks one document's bytes: can it be opened, how many pages, its fingerprint, and a first
 * guess at what it is. The type is decided from the file's contents, never only its name.
 */
export async function inspectDocument(bytes: Uint8Array, name: string, kind: Exclude<UploadKind, "zip">): Promise<Inspection> {
  const check = await checkFile(bytes, CONTENT_TYPES[kind]);
  const base = { sha256: sha256(bytes), size: bytes.length };
  if (check.status !== "ok") return { ...check, ...base, category: categorizeDocument(name) };
  let detail = check.detail;
  let text = "";
  if (kind === "pdf") {
    text = await firstPagesText(bytes);
    if (hasActiveContent(bytes)) {
      detail = [detail, "Contains embedded scripts or attachments, which we never open or run"].filter(Boolean).join("; ");
    }
  }
  return { ...check, detail, ...base, category: categorizeDocument(name, text) };
}

/** What the first bytes of a file say it is, whatever its name claims. */
export function sniffKind(head: Uint8Array): UploadKind | null {
  const b = head;
  if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05) && (b[3] === 0x04 || b[3] === 0x06)) return "zip";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (Buffer.from(b.subarray(0, 1024)).toString("latin1").includes("%PDF-")) return "pdf";
  return null;
}
