import { startQuickScanOrder } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, buttonPrimary, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { QUICK_SCAN, formatMoney } from "@/lib/config";

export const metadata = { title: "Order a Quick Scan · Condo Wise Guys" };

export default async function QuickScanOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser("/order/quick-scan");
  const { error } = await searchParams;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Order a {QUICK_SCAN.name}</h1>
        <p className="text-slate-600 mt-1">{QUICK_SCAN.tagline}</p>
      </div>
      <Card>
        <form action={startQuickScanOrder} className="space-y-4">
          {error && (
            <p className="text-sm text-rose-700">Please fill in your name and the property.</p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="customer_name">
              Your name
            </label>
            <input id="customer_name" name="customer_name" required maxLength={120} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="property">
              Property address or strata plan
            </label>
            <input
              id="property"
              name="property"
              required
              maxLength={240}
              placeholder="e.g. 204-1234 Lakeshore Rd, Kelowna (KAS1234)"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="notes">
              Anything you want us to look at closely? <span className="text-slate-400">(optional)</span>
            </label>
            <textarea id="notes" name="notes" rows={3} maxLength={2000} className={inputClass} />
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div>
              <div className="text-xs text-slate-500">Total</div>
              <div className="text-xl font-semibold">
                {formatMoney(QUICK_SCAN.priceCents, QUICK_SCAN.currency)}
              </div>
            </div>
            <SubmitButton className={buttonPrimary} pendingText="Opening secure checkout…">
              Continue to payment
            </SubmitButton>
          </div>
          <p className="text-xs text-slate-500">
            Ordering as {user.email}. Payment is handled by Stripe; we never see your card number. You upload
            your documents right after paying.
          </p>
        </form>
      </Card>
    </div>
  );
}
