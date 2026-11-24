-- Standard to Expert upgrades: a buyer who ordered a Standard review can upgrade to Expert
-- Reviewed at any time and pay only the difference. The upgrade is a second Stripe payment on the
-- same order, so the order keeps its documents and goes to Brian's review queue.
-- Run after Step 6, in the Supabase SQL editor. Safe to run twice.
--
-- amount_cents stays what the buyer paid at first; the upgrade payment is kept separately here.

alter table orders
  add column if not exists upgrade_session_id text,          -- Stripe Checkout for the upgrade
  add column if not exists upgrade_payment_intent text,      -- set once the upgrade is paid
  add column if not exists upgrade_amount_cents integer,     -- what the upgrade cost (the difference)
  add column if not exists upgraded_at timestamptz,          -- when the upgrade was paid
  add column if not exists upgraded_from_status text;        -- where the order was when it was upgraded

create index if not exists orders_upgrade_payment_intent_idx on orders (upgrade_payment_intent);
