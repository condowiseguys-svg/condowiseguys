-- Condo Wise Guys: Quick Scan order flow
-- Run once in the Supabase SQL editor (or with `supabase db push`).

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  email text not null,
  customer_name text not null,
  property text not null,
  notes text,
  service text not null default 'quick_scan',
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'awaiting_documents', 'in_review', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'refunded')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'cad',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_livemode boolean not null default false,
  paid_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('package', 'report')),
  bucket text not null check (bucket in ('packages', 'reports')),
  storage_path text not null unique,
  filename text not null,
  size_bytes bigint not null default 0,
  content_type text,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists order_files_order_id_idx on public.order_files (order_id);

-- Row level security. The app writes through the server-side service role only;
-- these policies are a second line of defence that lets a signed-in customer
-- read nothing but their own orders, and a report only once it is released.
alter table public.orders enable row level security;
alter table public.order_files enable row level security;

drop policy if exists "customers read own orders" on public.orders;
create policy "customers read own orders" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "customers read own files" on public.order_files;
create policy "customers read own files" on public.order_files
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_files.order_id
        and o.user_id = (select auth.uid())
        and (order_files.kind = 'package' or o.status = 'delivered')
    )
  );

-- Private storage buckets. No storage policies are created on purpose: files are
-- only reachable through short-lived signed URLs issued by the server after it
-- has checked who is asking.
insert into storage.buckets (id, name, public, file_size_limit)
values
  ('packages', 'packages', false, 52428800),
  ('reports', 'reports', false, 52428800)
on conflict (id) do update set public = false;
