import { deleteFile } from "@/app/actions";
import { formatBytes, formatDate } from "@/lib/config";
import type { OrderFile } from "@/lib/orders";
import { SubmitButton } from "./SubmitButton";

export function FileList({
  files,
  canDelete = false,
  empty,
}: {
  files: OrderFile[];
  canDelete?: boolean;
  empty: string;
}) {
  if (files.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {files.map((f) => (
        <li key={f.id} className="py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <a href={`/api/files/${f.id}`} className="font-medium text-brand hover:underline break-all">
              {f.filename}
            </a>
            <div className="text-xs text-slate-500">
              {formatBytes(f.size_bytes)} · {formatDate(f.created_at)}
            </div>
          </div>
          {canDelete && (
            <form action={deleteFile}>
              <input type="hidden" name="file_id" value={f.id} />
              <SubmitButton
                className="text-xs text-slate-500 hover:text-rose-700 cursor-pointer"
                pendingText="Removing…"
                confirm={`Remove ${f.filename}?`}
              >
                Remove
              </SubmitButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
