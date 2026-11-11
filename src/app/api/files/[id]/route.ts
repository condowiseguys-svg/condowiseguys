import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Secure download. Checks who is asking, then hands back a link that expires in 60 seconds.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const admin = createAdminClient();
  const { data: file } = await admin
    .from("order_files")
    .select("*, orders(user_id, status)")
    .eq("id", id)
    .maybeSingle();
  const order = file?.orders as { user_id: string; status: string } | null | undefined;

  const allowed =
    !!file &&
    !!order &&
    (isAdminEmail(user.email) ||
      (order.user_id === user.id && (file.kind === "package" || order.status === "delivered")));
  // Same answer whether the file does not exist or is not theirs.
  if (!allowed) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await admin.storage
    .from(file.bucket)
    .createSignedUrl(file.storage_path, 60, { download: file.filename });
  if (error || !data) return new NextResponse("File unavailable", { status: 500 });

  return NextResponse.redirect(data.signedUrl, 303);
}
