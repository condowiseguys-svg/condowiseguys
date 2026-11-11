# Order operations: records, retries and exceptions

How Condo Wise Guys handles an order from payment to delivery, what is kept permanently,
and what happens when something goes wrong. The admin dashboard is at `/admin`.

## Order states

| State | Meaning | Who acts |
|---|---|---|
| Awaiting payment | Form filled, buyer is on Stripe Checkout | Buyer |
| Payment failed | A delayed payment (e.g. bank debit) bounced | Buyer (emailed a retry link) |
| Cancelled | Checkout expired unpaid (24 h) | Nobody; the buyer can still use the pay link |
| Paid, no documents | Paid, waiting for uploads | Buyer |
| Processing | Documents submitted; checks and analysis running | System |
| Waiting on buyer | We asked for replacement or missing documents | Buyer |
| Expert review | Expert draft ready for Brian | Brian |
| Approved, sending | Report approved and archived; email going out | System |
| Delivered | Report emailed | Done |
| Refunded | Fully refunded in Stripe | Done |

## Permanent record of what was approved

When a report version is approved (by Brian for Expert, automatically for Standard):

1. The draft PDF is checked against the SHA-256 fingerprint taken when it was created.
2. The report and **every source document it was based on** are copied into the private
   `order-records` bucket under `<order>/v<version>-<id>/`.
3. `record.json` is written next to them: order details, the report fingerprint, each
   source document's name and SHA-256, who approved it and when.
4. The database row is marked approved. From then on the database refuses any change or
   delete of that version, its source documents, or the order. The bucket also blocks deletes.

Corrections are a new version; the earlier approved one stays as it was.

## Duplicate protection when jobs retry

- **Payments:** each Stripe event id is stored; a repeated webhook is ignored. Payment
  status only moves forward (`pending_payment → paid`), so a late duplicate changes nothing.
- **Submitting:** `submit_order()` is atomic. Two clicks give one submission number, and
  the job is started with the key `process-order:<order>:<submission>`, so one run per submission.
- **Processing:** the run claims the order (`claim_order_processing`). Another run for the
  same order exits immediately. Document fingerprints are written once; issues, costs and
  emails each have their own key, so a retried step can't repeat them.
- **Report drafts:** created with a source key; a retry returns the same version.
- **Delivery:** queued once per approved version (`deliver:<version>`). The email row is
  created before sending, and the same key is sent to Resend as its idempotency key, so a
  crash right after sending still can't produce a second email. The order only moves to
  delivered from approved.

## Exceptions

### Failed payment
- Card declined in Checkout: Stripe shows the error and the buyer tries again there. Nothing to do.
- Buyer leaves checkout: their page shows "Payment not completed" with a "Try payment again" button.
- Checkout expires (24 h): order marked cancelled, no email. The pay link still works.
- Delayed payment fails: order marked "Payment failed", buyer emailed a pay-again link,
  logged on the order. No work starts until payment succeeds.
- Refund or dispute: done in Stripe. A refund marks the order refunded; a dispute shows on
  the dashboard as urgent.

### Unreadable files
Checked automatically when the buyer submits:
- Empty files, damaged PDFs or images, and files that aren't really PDFs are **unreadable**.
- Scanned (image-only) pages are **not** a problem; they go to OCR.
- Secured PDFs with edit or print restrictions are accepted and noted.

If anything is unreadable, the order moves to "Waiting on buyer", the buyer gets one email
listing the files, and their upload page reopens with the problem next to each file. They
remove it, upload a new copy and submit again. The turnaround clock restarts from that submission.

### Incomplete packages
From the order page, Brian ticks what's missing (Form B, bylaws, two years of minutes,
financials, budget, depreciation report, insurance, and optional items) and adds a note.
The buyer gets one email and the upload page reopens. When the analysis step is added it
will raise the same request automatically when it can't find a required document.

### Processing or delivery failure
After retries are used up, an issue appears on the dashboard. Use **Re-run processing** or
**Retry delivery** on the order page. Both are safe to press more than once.

### Waiting too long
The dashboard flags: paid with no documents after 2 days, waiting on the buyer for more
than 3 days, processing over 2 hours, approved but not delivered after an hour, and any
order within 2 days of its subject removal date.

**Policy to confirm with Brian:** how long to wait on a buyer before offering a refund
(suggested: a reminder at 3 days, refund offer at 7 days).

## Cost per order
Recorded automatically, each once:
- Stripe fee (CAD) when payment succeeds.
- Trigger.dev compute for each processing run (USD).
- Claude tokens for each analysis call, priced from `src/lib/ops/costs.ts` (USD).

The dashboard shows cost and margin per order in CAD. US dollar amounts use `USD_TO_CAD`
(default 1.38).

## Setup checklist
1. Supabase SQL editor: run `0002_status_values.sql`, then `0003_operations.sql`.
2. Vercel env: `ADMIN_PASSWORD` (and optionally `ADMIN_USER`, default `brian`),
   `EMAIL_FROM` (e.g. `Condo Wise Guys <reports@send.condowiseguys.com>`), optional
   `EMAIL_REPLY_TO`, `NEXT_PUBLIC_SITE_URL`, optional `USD_TO_CAD`.
3. Trigger.dev project env (Production): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL`.
4. Stripe webhook: add the events `checkout.session.async_payment_failed`,
   `checkout.session.expired`, `charge.refunded`, `charge.dispute.created` to the endpoint.
