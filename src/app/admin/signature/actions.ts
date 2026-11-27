"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertAdmin } from "@/lib/admin-auth";
import { deleteSignature, saveSignature } from "@/lib/ops/signature";

function done(msg: string): never {
  revalidatePath("/admin/signature");
  redirect(`/admin/signature?msg=${encodeURIComponent(msg)}`);
}

export async function uploadSignature(form: FormData) {
  let msg = "Signature saved. It will appear on reports you approve from now on.";
  try {
    await assertAdmin();
    const file = form.get("signature");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose your signature image first.");
    await saveSignature(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    msg = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
  done(msg);
}

export async function removeSignature() {
  let msg = "Signature removed. Reports will show your typed name only.";
  try {
    await assertAdmin();
    await deleteSignature();
  } catch (err) {
    msg = `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
  done(msg);
}
