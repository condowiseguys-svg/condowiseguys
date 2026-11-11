-- Records, retry safety, exceptions and costs.
-- Run after 0002_status_values.sql, in the Supabase SQL editor.
--
-- What this adds:
--   * report_versions: every report draft, and a permanent, unchangeable record of each
--     approved version together with the exact source documents (by SHA-256) it was based on.
--   * order_events: an append-only log of everything that happened to an order.
--   * order_issues: problems that need the buyer or Brian (failed payment, unreadable file,
--     missing documents, failed processing or delivery).
--   * outbound_emails: one row per email, so a retried job can never send the same email twice.
--   * stripe_events: Stripe webhook ids already handled, so repeated deliveries are ignored.
--   * order_costs: what each order cost to process (Claude, compute, Stripe fee, email).

-- ---------------------------------------------------------------- orders
alter table orders
  add column if not exists submission_count integer not null default 0,
  add column if not exists processing_run_id text,
  add column if not exists processing_started_at timestamptz,
  add column if not exists documents_checked_at timestamptz,
  add column if not exists approved_report_id uuid,
  add column if not exists payment_failed_at timestamptz,
  add column if not exists refunded_at timestamptz;

-- ---------------------------------------------------------------- documents
alter table order_documents
  add column if not exists sha256 text,
  add column if not exists page_count integer,
  add column if not exists check_status text not null default 'pending'
    check (check_status in ('pending', 'ok', 'unreadable', 'empty')),
  add column if not exists check_detail text,
  add column if not exists checked_at timestamptz;

-- ---------------------------------------------------------------- report versions
create table if not exists report_versions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  version integer not null,
  created_at timestamptz not null default now(),
  created_by text not null,             -- 'pipeline:<run id>' or 'admin'
  source_key text unique,               -- makes "create this draft" safe to retry
  storage_path text not null,           -- draft PDF in strata-documents
  sha256 text not null,
  size_bytes bigint,
  model text,
  source_manifest jsonb not null,       -- [{document_id, file_name, storage_path, sha256, size_bytes}]
  manifest_sha256 text not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'discarded')),
  approved_at timestamptz,
  approved_by text,                     -- 'brian' (Expert) or 'auto' (Standard)
  archive_path text,                    -- folder in the order-records bucket
  unique (order_id, version)
);
create index if not exists report_versions_order_idx on report_versions (order_id);

do $$ begin
  alter table orders add constraint orders_approved_report_fk
    foreign key (approved_report_id) references report_versions (id);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------- events (append-only)
create table if not exists order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders (id) on delete restrict,
  at timestamptz not null default now(),
  actor text not null check (actor in ('system', 'buyer', 'admin', 'stripe')),
  kind text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists order_events_order_idx on order_events (order_id, at);

-- ---------------------------------------------------------------- issues
create table if not exists order_issues (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  created_at timestamptz not null default now(),
  kind text not null check (kind in (
    'payment_failed', 'unreadable_file', 'incomplete_package',
    'processing_failed', 'delivery_failed', 'dispute', 'other')),
  message text not null,
  buyer_visible boolean not null default false,  -- shown on the buyer's upload page
  document_id uuid references order_documents (id) on delete set null,
  dedupe_key text not null unique,               -- the same problem is only raised once
  resolved_at timestamptz,
  resolved_by text,
  resolution text
);
create index if not exists order_issues_open_idx on order_issues (order_id) where resolved_at is null;

-- ---------------------------------------------------------------- emails (one per key)
create table if not exists outbound_emails (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders (id) on delete restrict,
  idempotency_key text not null unique,
  kind text not null,
  to_email text not null,
  subject text not null,
  report_version_id uuid references report_versions (id),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_id text,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ---------------------------------------------------------------- stripe webhook ids
create table if not exists stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ---------------------------------------------------------------- costs
create table if not exists order_costs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete restrict,
  created_at timestamptz not null default now(),
  category text not null check (category in ('claude', 'compute', 'payment_fee', 'email', 'other')),
  description text not null,
  units jsonb not null default '{}'::jsonb,
  cost_cents numeric(12, 4) not null,
  currency text not null check (currency in ('cad', 'usd')),
  idempotency_key text not null unique          -- a retried step never counts twice
);
create index if not exists order_costs_order_idx on order_costs (order_id);

-- ---------------------------------------------------------------- lock everything down
alter table report_versions enable row level security;
alter table order_events enable row level security;
alter table order_issues enable row level security;
alter table outbound_emails enable row level security;
alter table stripe_events enable row level security;
alter table order_costs enable row level security;

-- ---------------------------------------------------------------- permanence rules
create or replace function forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception '% rows are permanent and cannot be changed or deleted', tg_table_name;
end;
$$;

drop trigger if exists order_events_append_only on order_events;
create trigger order_events_append_only before update or delete on order_events
  for each row execute function forbid_change();

-- An approved report can never change. A draft's content can never change either
-- (make a new version instead); only its status moves draft -> approved or discarded.
create or replace function protect_report_version() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      raise exception 'Approved report versions are permanent';
    end if;
    return old;
  end if;
  if old.status <> 'draft' then
    raise exception 'Report version % is % and can no longer change', old.version, old.status;
  end if;
  if new.order_id <> old.order_id or new.version <> old.version
     or new.storage_path <> old.storage_path or new.sha256 <> old.sha256
     or new.source_manifest <> old.source_manifest or new.manifest_sha256 <> old.manifest_sha256 then
    raise exception 'A report''s content is fixed. Create a new version instead.';
  end if;
  if new.status = 'approved'
     and (new.approved_at is null or new.approved_by is null or new.archive_path is null) then
    raise exception 'Approval needs approved_at, approved_by and archive_path';
  end if;
  return new;
end;
$$;

drop trigger if exists report_versions_protect on report_versions;
create trigger report_versions_protect before update or delete on report_versions
  for each row execute function protect_report_version();

-- A document's fingerprint can be set once, and a document used by an approved report
-- can't be deleted.
create or replace function protect_order_document() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if old.sha256 is not null and new.sha256 is distinct from old.sha256 then
      raise exception 'A document''s SHA-256 can only be set once';
    end if;
    if new.storage_path <> old.storage_path then
      raise exception 'A document''s storage path cannot change';
    end if;
    return new;
  end if;
  if exists (
    select 1 from report_versions rv
    where rv.order_id = old.order_id and rv.status = 'approved'
      and rv.source_manifest @> jsonb_build_array(jsonb_build_object('document_id', old.id::text))
  ) then
    raise exception 'This document is part of an approved report and is kept permanently';
  end if;
  return old;
end;
$$;

drop trigger if exists order_documents_protect on order_documents;
create trigger order_documents_protect before update or delete on order_documents
  for each row execute function protect_order_document();

create or replace function protect_order_delete() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from report_versions where order_id = old.id) then
    raise exception 'Orders with reports are permanent records';
  end if;
  return old;
end;
$$;

drop trigger if exists orders_protect_delete on orders;
create trigger orders_protect_delete before delete on orders
  for each row execute function protect_order_delete();

-- ---------------------------------------------------------------- retry-safe state changes
-- Buyer submits (or resubmits) documents. Returns the new submission number, or null if
-- the order is not in a state that can be submitted. Two clicks can't start two jobs.
create or replace function submit_order(p_order_id uuid) returns integer
language plpgsql as $$
declare n integer;
begin
  update orders
     set status = 'processing',
         submitted_at = now(),
         submission_count = submission_count + 1,
         processing_run_id = null,
         processing_started_at = null,
         documents_checked_at = null
   where id = p_order_id and status in ('paid', 'awaiting_documents')
  returning submission_count into n;
  return n;
end;
$$;

-- A processing run takes the order. A second run for the same submission (duplicate
-- trigger, replay) gets false and stops. Retries of the same run keep their claim.
create or replace function claim_order_processing(p_order_id uuid, p_run_id text, p_submission integer)
returns boolean
language plpgsql as $$
begin
  update orders
     set processing_run_id = p_run_id,
         processing_started_at = coalesce(processing_started_at, now())
   where id = p_order_id
     and status = 'processing'
     and submission_count = p_submission
     and (processing_run_id is null or processing_run_id = p_run_id);
  return found;
end;
$$;

create or replace function next_report_version(p_order_id uuid) returns integer
language sql as $$
  select coalesce(max(version), 0) + 1 from report_versions where order_id = p_order_id;
$$;

-- Only the server (service role) may call these.
revoke execute on function submit_order(uuid) from public, anon, authenticated;
revoke execute on function claim_order_processing(uuid, text, integer) from public, anon, authenticated;
revoke execute on function next_report_version(uuid) from public, anon, authenticated;
grant execute on function submit_order(uuid) to service_role;
grant execute on function claim_order_processing(uuid, text, integer) to service_role;
grant execute on function next_report_version(uuid) to service_role;

-- ---------------------------------------------------------------- permanent record bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-records',
  'order-records',
  false,
  104857600,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/json']
)
on conflict (id) do nothing;

-- Block deletes in the records bucket at the database level. If your project doesn't allow
-- triggers on storage tables, this prints a notice and the app's own rules still apply.
do $outer$
begin
  create or replace function public.protect_order_records() returns trigger
  language plpgsql as $f$
  begin
    if old.bucket_id = 'order-records' then
      raise exception 'Files in order-records are permanent';
    end if;
    return old;
  end;
  $f$;
  drop trigger if exists protect_order_records on storage.objects;
  create trigger protect_order_records before delete on storage.objects
    for each row execute function public.protect_order_records();
exception when insufficient_privilege then
  raise notice 'Skipped the storage delete guard (no permission on storage.objects).';
end;
$outer$;
