-- Tweak Reporting — reports table (monthly report drafts and published reports)
-- Run once in the Supabase SQL editor for project tbukoyemtlhainumypmd.
-- Safe to re-run: the table is created only if missing, and the unique
-- constraint is added only if it isn't already there.
--
-- The tweak-reports Worker (tweak-reports-worker/src/worker.js) reads and
-- writes this table with the service_role key. It upserts with
-- on_conflict=client_id,period, so the unique constraint below is required:
-- without it every save fails with "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- Check before running: public.clients.id must be a uuid (the foreign key
-- below assumes this). If your clients.id is a different type, change the
-- client_id column type to match before running.

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  period           text not null,              -- "YYYY-MM" (monthly) or "YYYY-Www" (weekly)
  title            text,
  author           text,
  status           text not null default 'draft'
                     check (status in ('draft', 'published')),
  answers          jsonb not null default '{}'::jsonb,
  se_rankings      jsonb,
  manual_data      jsonb,
  web_traffic      jsonb,
  generated        jsonb,                      -- the summary the report view renders
  revision_notes   jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reports'::regclass
      and contype = 'u'
      and conname = 'reports_client_id_period_key'
  ) then
    alter table public.reports
      add constraint reports_client_id_period_key unique (client_id, period);
  end if;
end $$;

-- Quick check afterwards:
-- select c.slug, r.period, r.status, r.updated_at
-- from public.reports r join public.clients c on c.id = r.client_id
-- order by r.updated_at desc limit 20;
