import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Brian's handwritten signature, drawn on the certification of reports he approves.
 * Kept in its own private storage bucket (never in the code, never at a public URL) and
 * read only on the server when a report is drawn.
 */
export const PRIVATE_BUCKET = "private-assets";
export const SIGNATURE_PATH = "signature/signature.png";
export const MAX_SIGNATURE_BYTES = 1024 * 1024;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isPng(bytes: Uint8Array) {
  return PNG_MAGIC.every((b, i) => bytes[i] === b);
}

async function ensureBucket() {
  const db = supabaseAdmin();
  const { data } = await db.storage.getBucket(PRIVATE_BUCKET);
  if (data) {
    if (data.public) await db.storage.updateBucket(PRIVATE_BUCKET, { public: false });
    return;
  }
  const { error } = await db.storage.createBucket(PRIVATE_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw new Error(`Could not create the private storage bucket: ${error.message}`);
}

export async function saveSignature(bytes: Uint8Array) {
  if (!isPng(bytes)) throw new Error("The signature must be a PNG image.");
  if (bytes.length > MAX_SIGNATURE_BYTES) throw new Error("The signature image must be under 1 MB.");
  await ensureBucket();
  const { error } = await supabaseAdmin()
    .storage.from(PRIVATE_BUCKET)
    .upload(SIGNATURE_PATH, bytes, { contentType: "image/png", upsert: true, cacheControl: "0" });
  if (error) throw new Error(`Could not save the signature: ${error.message}`);
}

export async function deleteSignature() {
  const { error } = await supabaseAdmin().storage.from(PRIVATE_BUCKET).remove([SIGNATURE_PATH]);
  if (error) throw new Error(`Could not remove the signature: ${error.message}`);
}

/** The signature PNG, or null if none is uploaded or storage can't be reached. */
export async function loadSignature(): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabaseAdmin().storage.from(PRIVATE_BUCKET).download(SIGNATURE_PATH);
    if (error || !data) return null;
    const bytes = new Uint8Array(await data.arrayBuffer());
    return isPng(bytes) ? bytes : null;
  } catch (err) {
    console.error("signature could not be loaded", err);
    return null;
  }
}
