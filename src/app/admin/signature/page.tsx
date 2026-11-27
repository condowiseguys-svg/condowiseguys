import { loadSignature } from "@/lib/ops/signature";
import { removeSignature, uploadSignature } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignaturePage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const { msg } = await searchParams;
  const signature = await loadSignature();
  // Shown inline from the server; the image is never given a public address.
  const preview = signature ? `data:image/png;base64,${Buffer.from(signature).toString("base64")}` : null;
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-navy-900">Your signature</h1>
      {msg && (
        <p
          className={`rounded-lg px-4 py-3 text-sm ring-1 ${
            msg.startsWith("Error") ? "bg-red-50 text-red-800 ring-red-200" : "bg-green-50 text-green-800 ring-green-200"
          }`}
        >
          {msg}
        </p>
      )}
      <p className="text-sm text-slate-700">
        Your signature is drawn on the certification of reports you review and approve. It is never added to Standard reports
        sent automatically. It is stored in a private storage area and is only read by the server when a report is drawn.
      </p>
      {preview ? (
        <div className="space-y-3 rounded-lg bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm font-medium text-green-700">A signature is on file.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Your signature" className="max-h-24 w-auto" />
          <form action={removeSignature}>
            <button className="text-sm text-red-700 hover:underline">Remove signature</button>
          </form>
        </div>
      ) : (
        <p className="text-sm font-medium text-amber-800">No signature on file. Reports show your typed name only.</p>
      )}
      <form action={uploadSignature} className="space-y-3 rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <label className="block text-sm font-medium text-slate-800">
          {preview ? "Replace with a new image" : "Upload your signature"} (PNG, under 1 MB)
          <input type="file" name="signature" accept="image/png" required className="mt-2 block w-full text-sm" />
        </label>
        <button className="rounded-md bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800">Save signature</button>
      </form>
    </div>
  );
}
