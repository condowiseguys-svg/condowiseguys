"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) {
      setError("That code did not work. Check it, or request a new email.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          We sent a sign-in email to <strong>{email}</strong>. Open the link in it, on this device, to continue.
        </p>
        <form onSubmit={verify} className="space-y-3 border-t border-slate-100 pt-4">
          <label className="block text-sm font-medium" htmlFor="code">
            Or enter the code from the email
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          />
          <div className="flex gap-3">
            <button className={buttonPrimary} disabled={busy || code.trim().length < 6}>
              Sign in
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setSent(false)}>
              Use a different email
            </button>
          </div>
        </form>
        {error && <p className="text-sm text-rose-700">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={send} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="email">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <button className={buttonPrimary} disabled={busy}>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </form>
  );
}
