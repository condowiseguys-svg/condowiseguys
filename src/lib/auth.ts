import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail, supabaseConfigured } from "./config";
import { createClient } from "./supabase/server";

export async function getUser(): Promise<User | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function requireUser(next: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(next = "/admin"): Promise<User> {
  const user = await requireUser(next);
  if (!isAdminEmail(user.email)) redirect("/orders");
  return user;
}
