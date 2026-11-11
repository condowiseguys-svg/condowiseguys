import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { safeNext } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

// Alternative landing point if the Supabase email template uses a token_hash link
// (works even when the email is opened on a different device from the one that asked for it).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/login?error=link&next=${encodeURIComponent(next)}`, url.origin));
}
