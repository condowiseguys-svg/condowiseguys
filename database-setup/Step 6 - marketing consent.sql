-- Opt-in consent for offers from DreamHomeGroup.ca (same owner as Condo Wise Guys).
-- Run after Step 5, in the Supabase SQL editor. Safe to run twice.
--
-- Kept in its own table, not on the order, because:
--   * approved orders are locked, but a buyer must be able to withdraw consent at any time;
--   * the 2-year erasure removes the buyer's details from the order, while consent records are
--     kept for as long as we rely on them (CASL asks us to be able to prove consent).
-- A row is only ever created when the buyer ticks the box. Withdrawal sets withdrawn_at.

create table if not exists marketing_consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  name text,
  order_id uuid references orders (id) on delete set null,
  source text not null,            -- where the box was ticked, e.g. 'order_form'
  consent_text text not null,      -- the exact wording the buyer agreed to
  withdrawn_at timestamptz
);
create index if not exists marketing_consents_email_idx on marketing_consents (lower(email));
create index if not exists marketing_consents_order_idx on marketing_consents (order_id);

-- Only the server (service role) reads or writes this table.
alter table marketing_consents enable row level security;
