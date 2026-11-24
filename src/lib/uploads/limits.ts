/**
 * What buyers can upload, shared by the upload page (browser) and the server.
 *
 * Big strata packages arrive as ZIP files of hundreds of PDFs, often over 100 MB, so the
 * browser sends files straight to Supabase Storage in 6 MB pieces (TUS resumable uploads).
 * Nothing passes through our web server, so Vercel's 4.5 MB request limit never applies.
 *
 * The real ceiling per file is the smaller of:
 *  - MAX_FILE_BYTES below,
 *  - the strata-documents bucket's file size limit (database-setup/Step 8),
 *  - the Supabase project's global upload limit (Free plan: 50 MB; Pro: up to 500 GB, set in
 *    Supabase > Storage > Settings).
 */

export const GB = 1024 * 1024 * 1024;
export const MB = 1024 * 1024;

/** Largest single file (a ZIP of the whole package). */
export const MAX_FILE_BYTES = 1 * GB;
/** Largest single PDF or photo, uploaded directly or found inside a ZIP. */
export const MAX_DOCUMENT_BYTES = 500 * MB;
/** Everything uploaded to one order, all files together. */
export const MAX_ORDER_BYTES = 5 * GB;
/** Files the buyer uploads to one order (each ZIP counts as one). */
export const MAX_ORDER_FILES = 1000;

/** Supabase requires TUS uploads in 6 MB pieces. */
export const TUS_CHUNK_BYTES = 6 * MB;

export type UploadKind = "pdf" | "jpeg" | "png" | "zip";

export const CONTENT_TYPES: Record<UploadKind, string> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  zip: "application/zip",
};

/** The file type from its name. Browsers report ZIPs under several MIME types, so the name decides. */
export function uploadKind(name: string): UploadKind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  if (ext === "png") return "png";
  if (ext === "zip") return "zip";
  return null;
}

/** Files the OS or archivers add that are never documents. */
export function isJunkFile(path: string) {
  const parts = path.split(/[\\/]/);
  const base = parts[parts.length - 1] ?? "";
  return (
    parts.some((p) => p === "__MACOSX") ||
    base.startsWith("._") ||
    base.startsWith("~$") ||
    /^(\.ds_store|thumbs\.db|desktop\.ini)$/i.test(base)
  );
}

export const ACCEPT_ATTR = ".pdf,.zip,.jpg,.jpeg,.png,application/pdf,application/zip,application/x-zip-compressed,image/jpeg,image/png";

export function formatBytes(bytes: number) {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
