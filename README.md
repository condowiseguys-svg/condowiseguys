# Condo Wise Guys

Next.js app for CondoWiseGuys.com. The first working flow is the **Quick Scan order**:

1. Customer signs in with an emailed link and picks Quick Scan (`/order/quick-scan`).
2. Customer pays through Stripe Checkout (test mode).
3. Customer uploads the strata package on their order page (`/orders/<id>`) and submits it.
4. Admin sees the order, payment status and uploaded files at `/admin`, attaches the finished report and clicks **Approve and release**.
5. Customer signs in and downloads the report. It is never emailed as an attachment.

## How it is put together

| Piece | What does it |
| --- | --- |
| Sign-in, database, file storage | Supabase |
| Payment | Stripe Checkout + webhook at `/api/stripe/webhook` |
| Email notices (optional) | Resend |
| Background jobs (not used by this flow yet) | Trigger.dev |

Security notes:

- Both storage buckets are private. Every download goes through `/api/files/<id>`, which checks who is asking and then issues a link that expires after 60 seconds.
- A report is invisible to the customer until the order status is `delivered`, which only the **Approve and release** button sets. This is enforced in the app and again by row level security in the database.
- All writes go through the server using the Supabase service role key. That key must never be given a `NEXT_PUBLIC_` name.
- Payment status only changes from a signature-verified Stripe webhook, or from asking Stripe directly about the order's own checkout session.
- The app refuses a live Stripe key unless `STRIPE_ALLOW_LIVE=true`.

## One-time setup

### 1. Supabase

1. Create a project at supabase.com.
2. SQL Editor: paste and run `supabase/migrations/0001_quick_scan_orders.sql`. It creates the `orders` and `order_files` tables, the security rules, and the private `packages` and `reports` buckets.
3. Authentication > URL Configuration: set **Site URL** to the app's address and add `<app address>/auth/callback` and `<app address>/auth/confirm` to **Redirect URLs** (add the `http://localhost:3000` versions too for local work).
4. Authentication > Emails > Magic Link, recommended template, so sign-in also works when the email is opened on another device:

   ```html
   <h2>Sign in to Condo Wise Guys</h2>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
   <p>Or enter this code: <strong>{{ .Token }}</strong></p>
   ```

   Use the same template for **Confirm signup** (a customer's first sign-in uses that one).
5. Project Settings > API: copy the URL, the anon key and the service role key.

Supabase's built-in email sender is limited to a few emails an hour. That is enough for testing; connect your own SMTP (Authentication > SMTP) before real customers arrive.

### 2. Stripe (test mode)

1. In the Stripe dashboard switch on **Test mode** and copy the secret key (`sk_test_...`).
2. Developers > Webhooks > Add endpoint: `<app address>/api/stripe/webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded`. Copy the signing secret (`whsec_...`).

For local work, `stripe listen --forward-to localhost:3000/api/stripe/webhook` prints a signing secret to use instead.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill it in. Put the same values into the host's environment settings (for example Vercel > Project > Settings > Environment Variables). `ADMIN_EMAILS` decides who can open `/admin`.

### 4. Run

```bash
npm install
npm run dev
```

## Test walkthrough

1. Open the site, click **Order a Quick Scan**, sign in with a customer email.
2. Fill in the form, continue to payment, pay with card `4242 4242 4242 4242`, any future expiry, any CVC.
3. Back on the order page, upload a sample strata package and click **That is everything. Start my review**.
4. Sign out, sign in with an `ADMIN_EMAILS` address, open **Dashboard**. The order shows as Paid / In review with its files.
5. Open the order, attach a report, click **Approve and release to customer**.
6. Sign back in as the customer. The report is now on the order page.

To see a declined payment use card `4000 0000 0000 0002`.

## Changing the price

`QUICK_SCAN_PRICE_CENTS` and `QUICK_SCAN_CURRENCY` in the environment. No Stripe product needs to be created.
