-- Keep approved reports and order records for 5 years after delivery, instead of 2.
-- Run in the Supabase SQL editor (after Step 8). Safe to run twice.
--
-- Why: a signed Condo Wise Guys report is professional work. USPAP-style record keeping
-- and E&O insurers expect the report and its record to be kept for 5 years.
-- Uploaded documents and draft reports are still deleted 90 days after delivery.
--
-- How: Step 5 (retention) set the 2-year rule inside its database functions: the one that
-- decides which orders are due, and the guards that refuse early deletes. This step finds
-- every function you created whose definition contains the 2-year period and rewrites that
-- period as 5 years. Nothing else in those functions changes. It then lists what it
-- changed. If it can't find the 2-year rule at all, it stops with an error and changes
-- nothing.

do $$
declare
  f record;
  old_def text;
  new_def text;
  changed int := 0;
  pol record;
begin
  for f in
    select p.oid, n.nspname, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.proowner = (select oid from pg_roles where rolname = current_user)
       and p.prokind = 'f'
       and n.nspname in ('public', 'storage')
  loop
    old_def := pg_get_functiondef(f.oid);
    new_def := old_def;
    -- '2 years', '2 year', '2 yrs'  ->  '5 years'
    new_def := regexp_replace(new_def, '''\s*2\s*(years?|yrs?)\s*''', '''5 years''', 'gi');
    -- '24 months', '730 days'  ->  '5 years'
    new_def := regexp_replace(new_def, '''\s*24\s*(months?|mons?)\s*''', '''5 years''', 'gi');
    new_def := regexp_replace(new_def, '''\s*730\s*days?\s*''', '''5 years''', 'gi');
    -- make_interval(years => 2)  ->  make_interval(years => 5)
    new_def := regexp_replace(new_def, '(make_interval\s*\(\s*years\s*=>\s*)2(\s*\))', '\15\2', 'gi');
    if new_def <> old_def then
      execute new_def;
      changed := changed + 1;
      raise notice 'Changed to 5 years: %.%', f.nspname, f.proname;
    end if;
  end loop;

  if changed = 0 then
    -- Already 5 years (this step was run before), or Step 5 isn't installed.
    if exists (
      select 1 from pg_proc p
       where p.proname = 'orders_due_for_retention' and p.prokind = 'f'
         and pg_get_functiondef(p.oid) ~* '''\s*5\s*years?\s*'''
    ) then
      raise notice 'Already set to 5 years. Nothing to change.';
    else
      raise exception 'Could not find the 2-year rule. Is Step 5 (retention) installed? Nothing was changed.';
    end if;
  end if;

  -- Row-level policies can't be rewritten this way. Flag any that still mention 2 years.
  for pol in
    select schemaname, tablename, policyname
      from pg_policies
     where coalesce(qual, '') || coalesce(with_check, '') ~* '(2\s*years?|24\s*mon|730\s*day)'
  loop
    raise warning 'Policy %.% "%" still mentions 2 years; send this message to Claude.', pol.schemaname, pol.tablename, pol.policyname;
  end loop;
end;
$$;

-- What the retention rules say now (should show 5 years and 90 days, no 2 years).
select n.nspname || '.' || p.proname as function_name,
       (pg_get_functiondef(p.oid) ~* '(''\s*5\s*years?\s*''|years\s*=>\s*5)') as says_5_years,
       (pg_get_functiondef(p.oid) ~* '(''\s*2\s*years?\s*''|years\s*=>\s*2\s*\))') as still_says_2_years
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where p.proowner = (select oid from pg_roles where rolname = current_user)
   and p.prokind = 'f'
   and n.nspname in ('public', 'storage')
   and pg_get_functiondef(p.oid) ~* '(''\s*[25]\s*years?\s*''|years\s*=>\s*[25]\s*\))'
 order by 1;
