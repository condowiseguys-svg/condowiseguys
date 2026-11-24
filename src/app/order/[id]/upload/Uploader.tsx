"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, type DetailedError } from "tus-js-client";
import type { UploadListing, UploadListItem } from "@/lib/uploads/listing";
import { ACCEPT_ATTR, formatBytes, isJunkFile, MB, TUS_CHUNK_BYTES, uploadKind } from "@/lib/uploads/limits";
import { getUploadTicket, listUploads, recordUpload, removeUpload, reportUploadProblem, submitDocuments, type UploadTicket } from "./actions";

/**
 * The buyer's upload box. Files go straight from the browser to Supabase Storage in 6 MB
 * pieces (TUS), three files at a time. An interrupted upload retries by itself and, if the
 * page is closed or the connection drops, carries on from the last piece when the buyer
 * comes back and adds the same file again. Our server only hands out one-time upload
 * permissions and records finished files; ZIPs are then unpacked in the background and the
 * list below updates on its own.
 */

type LocalStatus = "queued" | "uploading" | "paused" | "failed" | "saving";

type Local = {
  key: string;
  file: File;
  name: string;
  status: LocalStatus;
  sent: number;
  message?: string;
};

const PARALLEL = 3;
const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000, 30000, 60000];
/** Re-sign before Supabase's two-hour upload permission runs out. */
const RESIGN_AFTER_MS = 90 * 60 * 1000;
/** Without resumable uploads, a plain upload is only attempted below Supabase's Free plan limit. */
const PLAIN_UPLOAD_MAX = 45 * MB;

function resumeKey(orderId: string, name: string, file: File) {
  return `cwg-upload:${orderId}:${name}:${file.size}:${file.lastModified}`;
}

function readResume(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeResume(key: string, path: string | null) {
  try {
    if (path) localStorage.setItem(key, path);
    else localStorage.removeItem(key);
  } catch {
    // Private browsing: uploads still work, they just can't resume after the page closes.
  }
}

/** Thrown into a running upload when the buyer pauses or cancels it. */
class Stopped extends Error {}

function statusOf(err: unknown) {
  return (err as DetailedError | undefined)?.originalResponse?.getStatus?.() ?? 0;
}

/** Every file inside dropped folders, with its folder path kept for labelling. */
async function filesFromDrop(items: DataTransferItemList): Promise<{ file: File; name: string }[]> {
  const out: { file: File; name: string }[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, name: entry.fullPath.replace(/^\/+/, "") || file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns at most ~100 entries per call.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  const entries = Array.from(items)
    .map((i) => (i.kind === "file" ? i.webkitGetAsEntry?.() : null))
    .filter((e): e is FileSystemEntry => !!e);
  for (const e of entries) await walk(e);
  return out;
}

export function Uploader({ orderId, token, initial }: { orderId: string; token: string; initial: UploadListing }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [listing, setListing] = useState<UploadListing>(initial);
  const [locals, setLocals] = useState<Local[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploads = useRef(new Map<string, Upload>());
  const stoppers = useRef(new Map<string, () => void>());
  const running = useRef(new Set<string>());
  const localsRef = useRef<Local[]>([]);
  localsRef.current = locals;

  const patch = useCallback(
    (key: string, p: Partial<Local>) => setLocals((list) => list.map((l) => (l.key === key ? { ...l, ...p } : l))),
    [],
  );

  const refresh = useCallback(async () => {
    const res = await listUploads(orderId, token);
    if (!("error" in res)) setListing(res);
  }, [orderId, token]);

  // Keep the list current while files are being checked or unpacked.
  useEffect(() => {
    if (!listing.busy && !locals.length) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [listing.busy, locals.length, refresh]);

  // Closing the page mid-upload loses nothing (it resumes), but warn anyway.
  useEffect(() => {
    const active = locals.some((l) => l.status === "uploading" || l.status === "queued" || l.status === "saving");
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [locals]);

  const finish = useCallback(
    async (item: Local, path: string, rkey: string) => {
      patch(item.key, { status: "saving", sent: item.file.size });
      const saved = await recordUpload(orderId, token, { path, name: item.name });
      if ("error" in saved) return patch(item.key, { status: "failed", message: saved.error });
      writeResume(rkey, null);
      await refresh();
      setLocals((list) => list.filter((l) => l.key !== item.key));
    },
    [orderId, token, patch, refresh],
  );

  const fail = useCallback(
    (item: Local, err: unknown) => {
      const status = statusOf(err);
      if (status === 413) {
        const message = "This file is larger than our storage accepts right now. We've let our team know and will be in touch.";
        patch(item.key, { status: "failed", message });
        void reportUploadProblem(orderId, token, { name: item.name, size: item.file.size, message: `too large (HTTP 413)` });
        return;
      }
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      patch(item.key, {
        status: "paused",
        message: offline
          ? "Connection lost. The upload will continue when you're back online."
          : "Upload interrupted. Press Resume to continue from where it stopped.",
      });
      if (!offline) {
        void reportUploadProblem(orderId, token, {
          name: item.name,
          size: item.file.size,
          message: `${status ? `HTTP ${status}: ` : ""}${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
        });
      }
    },
    [orderId, token, patch],
  );

  /** Plain one-request upload, used only if resumable uploads aren't available. */
  const plainUpload = useCallback(
    async (item: Local, ticket: Extract<UploadTicket, { signedUrl: string }>, rkey: string) => {
      const res = await fetch(ticket.signedUrl, {
        method: "PUT",
        headers: { "content-type": ticket.contentType, "x-upsert": "false" },
        body: item.file,
      });
      if (!res.ok) throw Object.assign(new Error(`Upload failed (${res.status})`), { originalResponse: { getStatus: () => res.status } });
      await finish(item, ticket.path, rkey);
    },
    [finish],
  );

  const runOne = useCallback(
    async (item: Local) => {
      running.current.add(item.key);
      patch(item.key, { status: "uploading", message: undefined });
      const rkey = resumeKey(orderId, item.name, item.file);
      try {
        const ticket = await getUploadTicket(orderId, token, { name: item.name, size: item.file.size, resumePath: readResume(rkey) });
        if ("error" in ticket) {
          patch(item.key, { status: "failed", message: ticket.error });
          return;
        }
        if ("alreadyUploaded" in ticket) {
          await finish(item, ticket.path, rkey);
          return;
        }
        writeResume(rkey, ticket.path);
        let signature = ticket.token;
        let signedAt = Date.now();
        let resign = false;
        const { path, endpoints, contentType } = ticket;

        for (let e = 0; e < endpoints.length; e++) {
          const endpoint = endpoints[e];
          const last = e === endpoints.length - 1;
          const created = { value: false };
          try {
            await new Promise<void>((resolve, reject) => {
              stoppers.current.set(item.key, () => reject(new Stopped()));
              const upload = new Upload(item.file, {
                endpoint,
                chunkSize: TUS_CHUNK_BYTES,
                retryDelays: RETRY_DELAYS,
                removeFingerprintOnSuccess: true,
                uploadDataDuringCreation: true,
                metadata: { bucketName: "strata-documents", objectName: path, contentType, cacheControl: "3600" },
                // Tied to this order, file and storage path, so a resume never lands in the wrong place.
                fingerprint: async () => `${rkey}:${path}`,
                onBeforeRequest: async (req) => {
                  if (resign || Date.now() - signedAt > RESIGN_AFTER_MS) {
                    const next = await getUploadTicket(orderId, token, { name: item.name, size: item.file.size, resumePath: path });
                    if ("token" in next) {
                      signature = next.token;
                      signedAt = Date.now();
                    }
                    resign = false;
                  }
                  req.setHeader("x-signature", signature);
                },
                onAfterResponse: (req, res) => {
                  if (req.getMethod() === "POST" && res.getStatus() < 300) created.value = true;
                },
                onProgress: (sent) => patch(item.key, { sent }),
                onShouldRetry: (err) => {
                  const s = statusOf(err);
                  // Can't reach this address at all: move straight on to the next one.
                  if (s === 0 && !created.value && !last) return false;
                  if (s === 403 || s === 401 || s === 400) {
                    resign = true; // the permission may have expired: get a fresh one and try again
                    return true;
                  }
                  return s === 0 || s === 409 || s === 423 || s === 429 || s >= 500;
                },
                onError: reject,
                onSuccess: () => resolve(),
              });
              uploads.current.set(item.key, upload);
              upload
                .findPreviousUploads()
                .then((previous) => {
                  if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
                  upload.start();
                })
                .catch(reject);
            });
            await finish(item, path, rkey);
            return;
          } catch (err) {
            if (err instanceof Stopped) return; // the buyer paused or cancelled
            const s = statusOf(err);
            // The upload never started at this address: try the next one, then a plain upload.
            if (!created.value && (s === 0 || s === 404 || s === 405)) {
              if (!last) continue;
              if (item.file.size <= PLAIN_UPLOAD_MAX) {
                const plain = await getUploadTicket(orderId, token, { name: item.name, size: item.file.size, resumePath: path });
                if ("signedUrl" in plain) return await plainUpload(item, plain, rkey);
              }
            }
            throw err;
          }
        }
      } catch (err) {
        fail(item, err);
      } finally {
        uploads.current.delete(item.key);
        stoppers.current.delete(item.key);
        running.current.delete(item.key);
      }
    },
    [orderId, token, patch, finish, fail, plainUpload],
  );

  // Start queued files, a few at a time.
  useEffect(() => {
    const free = PARALLEL - running.current.size;
    if (free <= 0) return;
    locals
      .filter((l) => l.status === "queued" && !running.current.has(l.key))
      .slice(0, free)
      .forEach((l) => void runOne(l));
  }, [locals, runOne]);

  // Back online: resume anything that paused because the connection dropped.
  useEffect(() => {
    const resume = () =>
      setLocals((list) => list.map((l) => (l.status === "paused" ? { ...l, status: "queued", message: undefined } : l)));
    window.addEventListener("online", resume);
    return () => window.removeEventListener("online", resume);
  }, []);

  function addFiles(files: { file: File; name: string }[]) {
    setError(null);
    const notAccepted: string[] = [];
    const fresh: Local[] = [];
    for (const { file, name } of files) {
      if (isJunkFile(name)) continue;
      if (!uploadKind(name)) {
        notAccepted.push(name);
        continue;
      }
      const key = `${name}:${file.size}:${file.lastModified}`;
      if (localsRef.current.some((l) => l.key === key) || fresh.some((l) => l.key === key)) continue;
      fresh.push({ key, file, name, status: "queued", sent: 0 });
    }
    if (notAccepted.length) setSkipped((s) => [...s, ...notAccepted]);
    if (fresh.length) setLocals((list) => [...list, ...fresh]);
  }

  function pause(l: Local) {
    patch(l.key, { status: "paused", message: "Paused." });
    void uploads.current.get(l.key)?.abort();
    stoppers.current.get(l.key)?.();
  }

  function cancel(l: Local) {
    void uploads.current.get(l.key)?.abort(true);
    stoppers.current.get(l.key)?.();
    writeResume(resumeKey(orderId, l.name, l.file), null);
    setLocals((list) => list.filter((x) => x.key !== l.key));
  }

  async function remove(item: UploadListItem) {
    if (item.kind === "archive" && !confirm(`Remove ${item.name} and the ${item.archive?.documents ?? 0} documents unpacked from it?`)) return;
    const res = await removeUpload(orderId, token, item.id);
    if ("error" in res) return setError(res.error ?? "Could not remove the file.");
    await refresh();
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await submitDocuments(orderId, token);
    if ("error" in res) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    router.push(`/order/${orderId}/done?token=${token}`);
  }

  const uploading = locals.some((l) => l.status !== "failed");
  const unpacking = listing.items.some((i) => i.state === "unpacking");
  const totalBytes = locals.reduce((n, l) => n + l.file.size, 0);
  const sentBytes = locals.reduce((n, l) => n + Math.min(l.sent, l.file.size), 0);

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragging(false);
          const items = e.dataTransfer.items;
          if (items?.length && typeof items[0].webkitGetAsEntry === "function") addFiles(await filesFromDrop(items));
          else addFiles(Array.from(e.dataTransfer.files).map((file) => ({ file, name: file.name })));
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center ${
          dragging ? "border-brand-500 bg-brand-100/50" : "border-slate-300 bg-white"
        }`}
      >
        <p className="font-semibold text-navy-900">Drag your strata documents here</p>
        <p className="mt-1 text-sm text-slate-500">
          ZIP files (up to 1 GB each), PDFs, JPG or PNG, or whole folders. No need to unzip or sort anything.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
          >
            Choose files
          </button>
          <button
            type="button"
            onClick={() => folderRef.current?.click()}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-navy-900 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Choose a folder
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []).map((file) => ({ file, name: file.name })));
            e.target.value = "";
          }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []).map((file) => ({ file, name: file.webkitRelativePath || file.name })));
            e.target.value = "";
          }}
        />
      </div>

      {locals.length > 0 && (
        <section className="mt-6" aria-live="polite">
          <div className="flex items-baseline justify-between text-sm">
            <h2 className="font-semibold text-navy-900">Uploading</h2>
            <span className="text-slate-500">
              {formatBytes(sentBytes)} of {formatBytes(totalBytes)}
            </span>
          </div>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {locals.map((l) => {
              const pct = l.file.size ? Math.floor((Math.min(l.sent, l.file.size) / l.file.size) * 100) : 0;
              return (
                <li key={l.key} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-medium text-slate-800">{l.name}</p>
                    <div className="flex shrink-0 gap-3">
                      {l.status === "uploading" && (
                        <button type="button" onClick={() => pause(l)} className="text-slate-500 hover:text-navy-900">
                          Pause
                        </button>
                      )}
                      {(l.status === "paused" || l.status === "failed") && (
                        <button
                          type="button"
                          onClick={() => patch(l.key, { status: "queued", message: undefined })}
                          className="font-medium text-brand-600 hover:underline"
                        >
                          {l.status === "paused" ? "Resume" : "Try again"}
                        </button>
                      )}
                      {l.status !== "saving" && (
                        <button type="button" onClick={() => cancel(l)} className="text-slate-500 hover:text-risk-red">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-label={`${l.name} upload progress`}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full rounded-full transition-[width] ${l.status === "failed" ? "bg-risk-red" : l.status === "paused" ? "bg-amber-400" : "bg-brand-600"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className={`mt-1 ${l.status === "failed" ? "text-risk-red" : "text-slate-500"}`}>
                    {l.message ??
                      (l.status === "queued"
                        ? `Waiting · ${formatBytes(l.file.size)}`
                        : l.status === "saving"
                          ? "Finishing…"
                          : `${pct}% of ${formatBytes(l.file.size)}`)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {skipped.length > 0 && (
        <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-amber-200">
          Not uploaded (only PDF, ZIP, JPG and PNG are accepted): {skipped.slice(0, 8).join(", ")}
          {skipped.length > 8 ? ` and ${skipped.length - 8} more` : ""}. Please save these as PDF if they matter.
        </p>
      )}

      {listing.items.length > 0 && (
        <section className="mt-6">
          <div className="flex items-baseline justify-between text-sm">
            <h2 className="font-semibold text-navy-900">Your package</h2>
            <span className="text-slate-500">
              {listing.documents} document{listing.documents === 1 ? "" : "s"}
              {listing.pages ? ` · ${listing.pages.toLocaleString()} pages` : ""} ready
            </span>
          </div>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
            {listing.items.map((i) => (
              <PackageRow key={i.id} item={i} onRemove={() => remove(i)} />
            ))}
          </ul>
          {listing.possiblyMissing.length > 0 && !unpacking && listing.documents > 0 && (
            <p className="mt-3 text-sm text-slate-500">
              We couldn&apos;t spot these from the file names and first pages: {listing.possiblyMissing.join("; ")}. If
              they&apos;re in your package, there&apos;s nothing to do; our review reads every page.
            </p>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-risk-red ring-1 ring-red-200">
          {error}
        </p>
      )}

      {(uploading || unpacking) && (
        <p className="mt-6 text-sm text-slate-600">
          {uploading
            ? "You can submit once your uploads finish."
            : "Unpacking your ZIP files. You can leave this page; we'll email you when they're ready to submit."}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!listing.documents || uploading || unpacking || submitting}
        className="mt-4 w-full rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500 disabled:opacity-50 sm:w-auto"
      >
        {submitting
          ? "Submitting…"
          : `Submit ${listing.documents || ""} document${listing.documents === 1 ? "" : "s"} for review`}
      </button>
    </div>
  );
}

function PackageRow({ item: i, onRemove }: { item: UploadListItem; onRemove: () => void }) {
  const a = i.archive;
  const line =
    i.state === "checking"
      ? "Checking…"
      : i.state === "unpacking"
        ? a?.total
          ? `Unpacking: ${a.seen ?? 0} of ${a.total} files`
          : "Unpacking…"
        : i.state === "unpacked" && a
          ? `${a.documents} document${a.documents === 1 ? "" : "s"}${a.pages ? ` · ${a.pages.toLocaleString()} pages` : ""}${
              a.duplicates.length ? ` · ${a.duplicates.length} duplicate${a.duplicates.length === 1 ? "" : "s"} set aside` : ""
            }${a.skipped.length ? ` · ${a.skipped.length} skipped` : ""}`
          : i.state === "ready"
            ? [i.category, i.pages ? `${i.pages} page${i.pages === 1 ? "" : "s"}` : null, formatBytes(i.size)].filter(Boolean).join(" · ")
            : i.state === "duplicate"
              ? (i.detail ?? "Duplicate: it will be reviewed once.")
              : `${i.detail ?? "This file could not be read."} Remove it and upload a new copy.`;
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">
            {i.name}
            {i.insideOf && <span className="font-normal text-slate-500"> (in {i.insideOf})</span>}
          </p>
          <p className={i.state === "problem" ? "text-risk-red" : i.state === "duplicate" ? "text-amber-700" : "text-slate-500"}>
            {line}
          </p>
        </div>
        {i.locked ? (
          <span className="shrink-0 text-xs font-medium text-risk-green">Received</span>
        ) : (
          i.state !== "unpacking" && (
            <button type="button" onClick={onRemove} className="shrink-0 text-slate-500 hover:text-risk-red">
              Remove
            </button>
          )
        )}
      </div>
      {i.state === "unpacked" && a && (a.categories.length > 0 || a.duplicates.length > 0 || a.skipped.length > 0) && (
        <details className="mt-2 text-slate-600">
          <summary className="cursor-pointer text-brand-600">What we found</summary>
          {a.categories.length > 0 && (
            <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {a.categories.map((c) => (
                <li key={c.label}>
                  {c.label}: {c.count}
                </li>
              ))}
            </ul>
          )}
          {a.duplicates.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-slate-700">Duplicates set aside (reviewed once)</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {a.duplicates.slice(0, 50).map((d) => (
                  <li key={d.path}>
                    {d.path} <span className="text-slate-400">same as {d.sameAs}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.skipped.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-slate-700">Skipped</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {a.skipped.slice(0, 50).map((s) => (
                  <li key={s.path}>
                    {s.path}: <span className="text-slate-500">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
    </li>
  );
}
