-- Large strata packages: ZIP files up to 1 GB, hundreds of documents, resumable uploads.
-- Run after Step 7, in the Supabase SQL editor, BEFORE the website update goes live.
-- Safe to run twice, and safe to run before the update: it only adds things.
--
-- What it does:
--   1. Lets the strata-documents bucket take ZIP files and files up to 1 GB. (Supabase's own
--      project-wide limit still applies on top: 50 MB on the Free plan. See the PR notes.)
--   2. Adds columns so a ZIP and the documents unpacked from it are kept as separate records,
--      each with a type label, and so duplicate copies are recognised and reviewed only once.

-- ---------------------------------------------------------------- 1. storage bucket
update storage.buckets
   set file_size_limit = 1073741824,  -- 1 GB
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'application/zip']
 where id = 'strata-documents';

-- ---------------------------------------------------------------- 2. documents
alter table order_documents
  -- 'archive' for an uploaded ZIP, 'document' for a PDF or photo (uploaded or unpacked).
  add column if not exists kind text not null default 'document',
  -- The ZIP a document was unpacked from. Removing the ZIP removes its documents.
  add column if not exists parent_id uuid references order_documents (id) on delete cascade,
  -- First guess at the document type (form_b, minutes_council, ...), from its name and first pages.
  add column if not exists category text,
  -- Set when the same file (same SHA-256) is already in the order; only the first copy is reviewed.
  add column if not exists duplicate_of uuid references order_documents (id) on delete set null,
  -- For a ZIP: unpacking progress, then what was found, duplicated and skipped.
  add column if not exists unpack_detail jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_documents_kind_check') then
    alter table order_documents add constraint order_documents_kind_check check (kind in ('document', 'archive'));
  end if;
end;
$$;

-- New check results: 'duplicate' (a second copy) and 'archive' (a ZIP that has been unpacked).
alter table order_documents drop constraint if exists order_documents_check_status_check;
alter table order_documents add constraint order_documents_check_status_check
  check (check_status in ('pending', 'ok', 'unreadable', 'empty', 'duplicate', 'archive'));

create index if not exists order_documents_parent_idx on order_documents (parent_id);
create index if not exists order_documents_sha_idx on order_documents (order_id, sha256);

-- Only the server (service role) reads or writes documents. Buyers never get database access:
-- they upload with one-time signed permissions for a single path in their own order's folder.
alter table order_documents enable row level security;
