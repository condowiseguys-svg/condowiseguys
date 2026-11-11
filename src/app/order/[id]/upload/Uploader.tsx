"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getUploadUrl, recordUpload, removeUpload, submitDocuments } from "./actions";

type Item = {
  key: string;
  name: string;
  size: number;
  path?: string;
  status: "uploading" | "done" | "error";
  message?: string;
  locked?: boolean;
};

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Uploader({
  orderId,
  token,
  existing,
}: {
  orderId: string;
  token: string;
  existing: { path: string; name: string; size: number; locked?: boolean; problem?: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>(
    existing.map((f) => ({
      key: f.path,
      name: f.name,
      size: f.size,
      path: f.path,
      locked: f.locked,
      status: f.problem ? "error" : "done",
      message: f.problem ? `${f.problem} Remove it and upload a new copy.` : undefined,
    })),
  );
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  async function uploadOne(file: File) {
    const key = `${file.name}-${file.size}-${Math.random()}`;
    setItems((list) => [...list, { key, name: file.name, size: file.size, status: "uploading" }]);
    const ticket = await getUploadUrl(orderId, token, { name: file.name, size: file.size, type: file.type });
    if ("error" in ticket) return update(key, { status: "error", message: ticket.error });
    const res = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: { "content-type": file.type, "x-upsert": "false" },
      body: file,
    });
    if (!res.ok) return update(key, { status: "error", message: "Upload failed. Please try again." });
    const saved = await recordUpload(orderId, token, { path: ticket.path, name: file.name, size: file.size });
    if ("error" in saved) return update(key, { status: "error", message: saved.error });
    update(key, { status: "done", path: ticket.path });
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    for (const f of Array.from(files)) await uploadOne(f);
  }

  async function remove(item: Item) {
    if (item.path) {
      const res = await removeUpload(orderId, token, item.path);
      if ("error" in res) return setError(res.error ?? "Could not remove the file.");
    }
    setItems((list) => list.filter((i) => i.key !== item.key));
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

  const uploading = items.some((i) => i.status === "uploading");
  const doneCount = items.filter((i) => i.status === "done").length;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 text-center ${
          dragging ? "border-brand-500 bg-brand-100/50" : "border-slate-300 bg-white"
        }`}
      >
        <p className="font-semibold text-navy-900">Drag your strata documents here</p>
        <p className="mt-1 text-sm text-slate-500">PDF, JPG or PNG, up to 100 MB each</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
        >
          Choose files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-6 divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
          {items.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">{i.name}</p>
                <p className={i.status === "error" ? "text-risk-red" : "text-slate-500"}>
                  {i.status === "uploading" ? "Uploading…" : i.status === "error" ? i.message : mb(i.size)}
                </p>
              </div>
              {i.locked ? (
                <span className="shrink-0 text-xs font-medium text-risk-green">Received</span>
              ) : i.status !== "uploading" && (
                <button type="button" onClick={() => remove(i)} className="shrink-0 text-slate-500 hover:text-risk-red">
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-risk-red ring-1 ring-red-200">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!doneCount || uploading || submitting}
        className="mt-6 w-full rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500 disabled:opacity-50 sm:w-auto"
      >
        {submitting ? "Submitting…" : `Submit ${doneCount || ""} document${doneCount === 1 ? "" : "s"} for review`}
      </button>
    </div>
  );
}
