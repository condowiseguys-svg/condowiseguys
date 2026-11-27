-- Keep uploaded documents with the report for 5 years after delivery, instead of 90 days.
-- Run in the Supabase SQL editor, after Step 9. Safe to run more than once.
--
-- Why (Brian, 2026-11-27): the documents a signed report relied on are part of its
-- workfile, so they are kept as long as the report itself (5 years).
--
-- New rules:
--   * Delivered orders: uploaded documents, drafts, the approved report and the record are
--     all kept 5 years after delivery, then deleted together, and the buyer's personal
--     details are erased from the order (as before).
--   * Orders that never got a report (refunded, cancelled, unpaid): no workfile to keep, so
--     their uploaded documents are still deleted 90 days after the refund or order date,
--     and the rest after 5 years.
--   * Orders still in progress are never touched.
-- Documents already deleted under the old 90-day rule can't be brought back.

-- What retention allows for one order right now: 'none', 'documents' or 'all'.
create or replace function retention_stage(p_order_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when s is null then 'none'
    when s < now() - interval '5 years' then 'all'
    when status <> 'delivered' and s < now() - interval '90 days' then 'documents'
    else 'none'
  end
  from (select retention_start(o) as s, o.status from orders o where o.id = p_order_id) x;
$$;

-- Orders with something left to delete.
create or replace function orders_due_for_retention(p_limit integer default 50)
returns table (order_id uuid, stage text)
language sql stable security definer set search_path = public as $$
  select o.id, retention_stage(o.id)
  from orders o
  where retention_start(o) is not null
    and (
      (o.documents_purged_at is null and o.status <> 'delivered' and retention_start(o) < now() - interval '90 days')
      or ((o.documents_purged_at is null or o.personal_data_purged_at is null) and retention_start(o) < now() - interval '5 years')
    )
  order by retention_start(o)
  limit p_limit;
$$;

revoke execute on function retention_stage(uuid) from public, anon, authenticated;
revoke execute on function orders_due_for_retention(integer) from public, anon, authenticated;
grant execute on function retention_stage(uuid) to service_role;
grant execute on function orders_due_for_retention(integer) to service_role;

-- Check: delivered orders and when their files are now due (should be 5 years after delivery).
select o.id, o.status, retention_start(o) as clock_started,
       retention_start(o) + interval '5 years' as everything_deleted_on,
       retention_stage(o.id) as due_now
  from orders o
 where o.status = 'delivered'
 order by retention_start(o) desc
 limit 10;
