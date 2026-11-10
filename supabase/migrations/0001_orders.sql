-- Orders and uploaded documents for Condo Wise Guys.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- The app only talks to these tables from the server with the service role key,
-- so row level security is on with no public policies: browsers cannot read them.

create type order_status as enum (
  'pending_payment',  -- form submitted, waiting for Stripe
  'paid',             -- payment confirmed, waiting for documents
  'processing',       -- documents uploaded, analysis running
  'in_review',        -- Expert orders: waiting for Brian
  'delivered',        -- report emailed
  'cancelled'
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status order_status not null default 'pending_payment',
  tier text not null check (tier in ('standard', 'expert')),
  rush boolean not null default false,
  amount_cents integer not null,
  currency text not null default 'cad',
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  property_address text not null,
  unit_number text,
  strata_plan text,
  subject_removal_date date,
  notes text,
  -- Secret token in the upload link so only the buyer can add documents.
  upload_token uuid not null default gen_random_uuid(),
  stripe_session_id text unique,
  stripe_payment_intent text,
  paid_at timestamptz,
  submitted_at timestamptz,
  delivered_at timestamptz
);

create index orders_status_idx on orders (status);
create index orders_email_idx on orders (lower(buyer_email));

create table order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  created_at timestamptz not null default now(),
  storage_path text not null unique,
  file_name text not null,
  size_bytes bigint
);

create index order_documents_order_idx on order_documents (order_id);

alter table orders enable row level security;
alter table order_documents enable row level security;

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

-- Private bucket for strata packages. 100 MB per file, PDFs and images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'strata-documents',
  'strata-documents',
  false,
  104857600,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;
