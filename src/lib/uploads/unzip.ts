import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { sniffKind } from "./inspect";
import { GB, isJunkFile, MAX_DOCUMENT_BYTES, MB, uploadKind, type UploadKind } from "./limits";

/**
 * Safe ZIP extraction for strata packages.
 *
 * Nothing from the archive is ever written to disk under its own name or run: each entry is
 * read into memory (or a temp file with a random name for a ZIP inside the ZIP) and handed
 * to the caller, which stores it under a name we choose. Protections:
 *  - ZIP bombs: limits on entry count, size per entry, total unpacked size and compression
 *    ratio, and the unpacked bytes are counted as they stream (yauzl also checks each entry's
 *    real size against what the archive claims);
 *  - unsafe paths ("../", absolute paths, odd characters): yauzl rejects the archive, and we
 *    never use entry names as file paths anyway;
 *  - symbolic links, password-protected entries and anything that isn't a PDF, JPG or PNG
 *    (checked by its first bytes, not its name) are skipped and listed for the buyer;
 *  - ZIPs inside the ZIP are opened up to MAX_DEPTH levels, sharing the same limits.
 */
export const ZIP_LIMITS = {
  maxEntries: 10_000,
  maxTotalBytes: 4 * GB,
  maxEntryBytes: MAX_DOCUMENT_BYTES,
  /** Unpacked size / packed size above this, for entries over 1 MB, looks like a bomb. */
  maxRatio: 200,
  maxDepth: 2,
};

export type ZipDocument = { path: string; kind: Exclude<UploadKind, "zip">; bytes: Uint8Array };
export type Skipped = { path: string; reason: string };

export class UnsafeArchiveError extends Error {}
/** An error from our own handler (e.g. storage), not a problem with the archive. */
export class HandlerError extends Error {
  constructor(readonly inner: unknown) {
    super(inner instanceof Error ? inner.message : String(inner));
  }
}

type Budget = { entries: number; bytes: number };

function open(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true, validateEntrySizes: true, strictFileNames: false }, (err, zip) =>
      err || !zip ? reject(err ?? new Error("Could not open the ZIP")) : resolve(zip),
    ),
  );
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) =>
      err || !stream ? reject(err ?? new Error("Could not read entry")) : resolve(stream),
    ),
  );
}

/** Counts bytes as they stream and stops the moment a limit is passed. */
function limiter(max: number, budget: Budget) {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, done) {
      seen += chunk.length;
      budget.bytes += chunk.length;
      if (seen > max) return done(new UnsafeArchiveError("A file in the ZIP is larger than it claims to be"));
      if (budget.bytes > ZIP_LIMITS.maxTotalBytes) return done(new UnsafeArchiveError("The ZIP unpacks to more than 4 GB"));
      done(null, chunk);
    },
  });
}

async function readAll(stream: NodeJS.ReadableStream, max: number, budget: Budget) {
  const chunks: Buffer[] = [];
  const sink = new Transform({
    transform(chunk: Buffer, _e, done) {
      chunks.push(chunk);
      done();
    },
  });
  await pipeline(stream, limiter(max, budget), sink);
  return new Uint8Array(Buffer.concat(chunks));
}

function isSymlink(entry: yauzl.Entry) {
  return ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
}

function isEncrypted(entry: yauzl.Entry) {
  return (entry.generalPurposeBitFlag & 0x1) !== 0;
}

/** Readable path for messages and citations, e.g. "Minutes/2024/March council.pdf". */
function cleanPath(prefix: string, name: string) {
  const p = name
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/[\u0000-\u001f]/g, "");
  return (prefix ? `${prefix}/${p}` : p).slice(-240);
}

/**
 * Walks every entry of a ZIP on local disk, calling onDocument for each PDF or image.
 * onDocument is awaited, so only one document is held in memory at a time.
 */
export async function unpackZip(
  file: string,
  onDocument: (doc: ZipDocument) => Promise<void>,
  opts: {
    prefix?: string;
    depth?: number;
    budget?: Budget;
    skipped?: Skipped[];
    onProgress?: (seen: number, total: number) => Promise<void>;
  } = {},
) {
  const depth = opts.depth ?? 0;
  const budget = opts.budget ?? { entries: 0, bytes: 0 };
  const skipped = opts.skipped ?? [];
  const zip = await open(file);
  if (zip.entryCount + budget.entries > ZIP_LIMITS.maxEntries) {
    zip.close();
    throw new UnsafeArchiveError(`The ZIP holds more than ${ZIP_LIMITS.maxEntries.toLocaleString()} files`);
  }

  let seen = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (err: unknown) => {
        zip.close();
        reject(err);
      };
      zip.on("error", fail);
      zip.on("end", () => resolve());
      zip.on("entry", (entry: yauzl.Entry) => {
        (async () => {
          seen++;
          budget.entries++;
          const path = cleanPath(opts.prefix ?? "", entry.fileName);
          if (opts.onProgress && depth === 0 && seen % 10 === 0) await opts.onProgress(seen, zip.entryCount);
          if (/\/$/.test(entry.fileName) || isJunkFile(path)) return;
          if (isSymlink(entry)) return void skipped.push({ path, reason: "a link to another file, not a document" });
          if (isEncrypted(entry)) return void skipped.push({ path, reason: "password-protected inside the ZIP" });

          const named = uploadKind(path);
          if (!named) return void skipped.push({ path, reason: "file type not accepted (please send PDF, JPG or PNG)" });
          if (entry.uncompressedSize > ZIP_LIMITS.maxEntryBytes && named !== "zip") {
            return void skipped.push({ path, reason: `larger than ${ZIP_LIMITS.maxEntryBytes / MB} MB` });
          }
          if (
            entry.uncompressedSize > MB &&
            entry.compressedSize > 0 &&
            entry.uncompressedSize / entry.compressedSize > ZIP_LIMITS.maxRatio
          ) {
            throw new UnsafeArchiveError(`${path} is compressed suspiciously well (a possible ZIP bomb)`);
          }

          if (named === "zip") {
            if (depth + 1 > ZIP_LIMITS.maxDepth) return void skipped.push({ path, reason: "ZIP nested too deeply" });
            const tmp = join(tmpdir(), `cwg-${randomUUID()}.zip`);
            try {
              await pipeline(await openEntry(zip, entry), limiter(ZIP_LIMITS.maxTotalBytes, budget), createWriteStream(tmp));
              await unpackZip(tmp, onDocument, { prefix: path.replace(/\.zip$/i, ""), depth: depth + 1, budget, skipped });
            } catch (err) {
              // A bomb anywhere stops everything; a damaged inner ZIP is just listed.
              if (err instanceof UnsafeArchiveError || err instanceof HandlerError) throw err;
              skipped.push({ path, reason: "a damaged ZIP inside the ZIP" });
            } finally {
              await rm(tmp, { force: true });
            }
            return;
          }

          const bytes = await readAll(await openEntry(zip, entry), ZIP_LIMITS.maxEntryBytes, budget);
          if (!bytes.length) return void skipped.push({ path, reason: "empty file" });
          const actual = sniffKind(bytes.subarray(0, 1024));
          if (actual !== named) {
            return void skipped.push({
              path,
              reason: actual
                ? `named .${path.split(".").pop()} but is really a ${actual.toUpperCase()}`
                : "not really a PDF or image",
            });
          }
          try {
            await onDocument({ path, kind: named, bytes });
          } catch (err) {
            throw err instanceof HandlerError ? err : new HandlerError(err);
          }
        })().then(
          () => zip.readEntry(),
          (err) => fail(err),
        );
      });
      zip.readEntry();
    });
  } finally {
    zip.close();
  }
  return { skipped, entries: budget.entries, bytes: budget.bytes };
}
