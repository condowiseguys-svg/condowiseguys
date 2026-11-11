"use client";

import { useActionState, useState } from "react";
import { createOrder, type OrderFormState } from "./actions";

type TierOption = { id: string; name: string; turnaround: string; price: string };

const input =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
const label = "block text-sm font-medium text-slate-700";

export function OrderForm({
  tiers,
  rushPrice,
  initialTier,
  testMode,
}: {
  tiers: TierOption[];
  rushPrice: string;
  initialTier: string;
  testMode: boolean;
}) {
  const [state, action, pending] = useActionState<OrderFormState, FormData>(createOrder, {});
  const [tier, setTier] = useState(initialTier);

  return (
    <form action={action} className="space-y-8">
      {testMode && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-risk-amber ring-1 ring-amber-200">
          Test mode: no real charge. Use card 4242 4242 4242 4242, any future date and any CVC.
        </p>
      )}

      <fieldset>
        <legend className="text-lg font-semibold text-navy-900">1. Choose your review</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {tiers.map((t) => (
            <label
              key={t.id}
              className={`cursor-pointer rounded-xl p-4 ring-1 ${
                tier === t.id ? "bg-brand-100/60 ring-2 ring-brand-500" : "bg-white ring-slate-200"
              }`}
            >
              <input
                type="radio"
                name="tier"
                value={t.id}
                checked={tier === t.id}
                onChange={() => setTier(t.id)}
                className="sr-only"
              />
              <span className="block font-semibold text-navy-900">{t.name}</span>
              <span className="block text-sm text-slate-500">{t.turnaround}</span>
              <span className="mt-2 block font-semibold">{t.price}</span>
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="rush" className="mt-1 h-4 w-4" />
          <span>
            <span className="font-medium">Add Rush</span> ({rushPrice}): front of the queue for tight
            subject-removal deadlines.
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-navy-900">2. The property</legend>
        <div>
          <label className={label} htmlFor="property_address">Property address *</label>
          <input id="property_address" name="property_address" required className={input} placeholder="1909 - 1009 Expo Blvd, Vancouver" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="unit_number">Unit</label>
            <input id="unit_number" name="unit_number" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="strata_plan">Strata plan number</label>
            <input id="strata_plan" name="strata_plan" className={input} placeholder="LMS2995" />
          </div>
          <div>
            <label className={label} htmlFor="subject_removal_date">Subject removal date</label>
            <input id="subject_removal_date" name="subject_removal_date" type="date" className={input} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold text-navy-900">3. Your details</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="buyer_name">Full name *</label>
            <input id="buyer_name" name="buyer_name" required autoComplete="name" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="buyer_email">Email for the report *</label>
            <input id="buyer_email" name="buyer_email" type="email" required autoComplete="email" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="buyer_phone">Phone</label>
            <input id="buyer_phone" name="buyer_phone" type="tel" autoComplete="tel" className={input} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="notes">Anything we should look at closely?</label>
          <textarea id="notes" name="notes" rows={3} className={input} />
        </div>
      </fieldset>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" name="agree" required className="mt-1 h-4 w-4" />
        <span>
          I understand the report is a review of the strata documents, not legal advice, a home
          inspection or an appraisal.
        </span>
      </label>

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
          {pending ? "Taking you to payment…" : "Continue to secure payment"}
        </button>
        <p className="mt-3 text-sm text-slate-500">
          Payment is handled by Stripe. You upload your documents right after paying.
        </p>
      </div>
    </form>
  );
}
