"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createUploadTicket, recordUpload } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

type Row = { name: string; state: "uploading" | "done" | "error"; message?: string };

/**
 * Sends files straight from the browser into private storage using a one-time
 * ticket from the server, so large strata packages never pass through the web server.
 */
export function Uploader({
  orderId,
  kind,
  label,
  accept,
}: {
  orderId: string;
  kind: "package" | "report";
  label: string;
  accept: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const list = Array.from(files);
    setRows(list.map((f) => ({ name: f.name, state: "uploading" })));

    const set = (i: number, patch: Partial<Row>) =>
      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const ticket = await createUploadTicket({
          orderId,
          kind,
          filename: file.name,
          size: file.size,
        });
        if (!ticket.ok) throw new Error(ticket.error);

        const { error } = await supabase.storage
          .from(ticket.bucket)
          .uploadToSignedUrl(ticket.path, ticket.token, file, {
            contentType: file.type || "application/octet-stream",
          });
        if (error) throw new Error(error.message);

        const saved = await recordUpload({
          orderId,
          kind,
          path: ticket.path,
          filename: file.name,
          contentType: file.type,
        });
        if (!saved.ok) throw new Error(saved.error ?? "Could not save the file.");
        set(i, { state: "done" });
      } catch (err) {
        set(i, { state: "error", message: err instanceof Error ? err.message : "Upload failed." });
      }
    }

    if (input.current) input.current.value = "";
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm cursor-pointer hover:border-brand">
        <span className="font-medium">{busy ? "Uploading…" : label}</span>
        <span className="text-xs text-slate-500">PDF, ZIP, Word, Excel or images, up to 50 MB each</span>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          disabled={busy}
          className="sr-only"
          onChange={(e) => upload(e.target.files)}
        />
      </label>
      {rows.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {rows.map((r, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{r.name}</span>
              <span
                className={
                  r.state === "error"
                    ? "text-rose-700"
                    : r.state === "done"
                      ? "text-emerald-700"
                      : "text-slate-500"
                }
              >
                {r.state === "uploading" ? "Uploading…" : r.state === "done" ? "Uploaded" : r.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
