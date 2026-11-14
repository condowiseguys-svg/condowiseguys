import type { ManifestEntry } from "@/lib/ops/records";
import type { PageText } from "./extract";

/**
 * All uploaded files are numbered as one package: page 1 is the first page of the first
 * file, and so on. Claude only ever sees and cites these package page numbers, and the
 * report turns them back into file + page when the buyer uploaded more than one file.
 */
export type PackagePage = PageText & { n: number };

export function numberPages(perDoc: PageText[][]): PackagePage[] {
  let n = 0;
  return perDoc.flat().map((p) => ({ ...p, n: ++n }));
}

/** "p. 12", or "Minutes 2024.pdf p. 3" when the package has several files. */
export function makeCiter(pages: PackagePage[], manifest: ManifestEntry[]) {
  const byN = new Map(pages.map((p) => [p.n, p]));
  const multi = manifest.length > 1;
  const one = (n: number) => {
    const p = byN.get(n);
    if (!p) return null;
    return { doc: p.doc, page: p.page };
  };
  return (ns: number[]): string => {
    const valid = [...new Set(ns)].filter((n) => byN.has(n)).sort((a, b) => a - b);
    if (!valid.length) return "";
    // Collapse runs (12, 13, 14 -> 12-14) within the same file.
    const parts: string[] = [];
    let i = 0;
    while (i < valid.length) {
      const start = one(valid[i])!;
      let j = i;
      while (j + 1 < valid.length && valid[j + 1] === valid[j] + 1 && one(valid[j + 1])!.doc === start.doc) j++;
      const end = one(valid[j])!;
      const range = j > i ? `${start.page}-${end.page}` : `${start.page}`;
      const prefix = multi ? `${manifest[start.doc]?.file_name ?? `File ${start.doc + 1}`} ` : "";
      parts.push(`${prefix}p. ${range}`);
      i = j + 1;
    }
    const shown = parts.slice(0, 4).join(", ");
    return parts.length > 4 ? `${shown} and others` : shown;
  };
}

/** Page text wrapped with its package page number, as Claude sees it. */
export function renderPages(pages: PackagePage[]) {
  return pages.map((p) => `<page n="${p.n}">\n${p.text}\n</page>`).join("\n");
}

/** First part of every page, for sorting the package into documents. */
export function renderIndex(pages: PackagePage[], chars = 450) {
  return pages
    .map((p) => {
      const t = p.text.replace(/\s+/g, " ").trim();
      return `[${p.n}] ${t.length > chars ? `${t.slice(0, chars)}…` : t}`;
    })
    .join("\n");
}
