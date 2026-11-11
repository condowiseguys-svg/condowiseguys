import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { safeNext, supabaseConfigured } from "@/lib/config";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Condo Wise Guys" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getUser()) redirect(next);

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-slate-600 mt-1">
          No password needed. We email you a secure link, which keeps your documents and report private to you.
        </p>
      </div>
      <Card>
        {params.error && (
          <p className="text-sm text-rose-700 mb-4">
            That sign-in link has expired or was opened in a different browser. Request a new one below.
          </p>
        )}
        {supabaseConfigured() ? (
          <LoginForm next={next} />
        ) : (
          <p className="text-sm text-slate-600">
            Sign-in is not set up yet. Add the Supabase keys from <code>.env.example</code>.
          </p>
        )}
      </Card>
    </div>
  );
}
