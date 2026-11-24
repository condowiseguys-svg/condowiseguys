"use client";

import { useActionState } from "react";
import { sendContactMessage, type ContactFormState } from "./actions";
import { CONTACT_TOPICS } from "./topics";

const input =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
const label = "block text-sm font-medium text-slate-700";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(sendContactMessage, {});

  if (state.sent) {
    return (
      <div role="status" className="rounded-xl bg-green-50 p-6 ring-1 ring-green-200">
        <p className="font-semibold text-navy-900">Thanks, your message is on its way.</p>
        <p className="mt-2 leading-7 text-slate-700">
          We usually reply within one business day. If your subject-removal date is close, say so
          and we will get back to you sooner.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {/* Spam trap: hidden from people, but simple bots fill in every field. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Do not fill in
          <input type="text" name="cwg_trap" tabIndex={-1} autoComplete="one-time-code" data-1p-ignore data-lpignore="true" defaultValue="" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="name">Your name *</label>
          <input id="name" name="name" required maxLength={120} autoComplete="name" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="email">Email *</label>
          <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="phone">Phone (optional)</label>
          <input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="topic">What is it about?</label>
          <select id="topic" name="topic" className={input} defaultValue={CONTACT_TOPICS[0]}>
            {CONTACT_TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="message">Message *</label>
        <textarea
          id="message"
          name="message"
          rows={6}
          required
          maxLength={5000}
          className={input}
          placeholder="If it's about a property, include the address and your subject-removal date."
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-risk-red ring-1 ring-red-200">
          {state.error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-500 disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Sending…" : "Send message"}
        </button>
        <p className="mt-3 text-sm text-slate-500">
          We use your details only to reply to you. See our{" "}
          <a href="/privacy" className="underline">privacy policy</a>.
        </p>
      </div>
    </form>
  );
}
