-- Tweak Reporting — account manager column + BAF Motorsport / IPPS onboarding
-- Run this once in the Supabase SQL editor for project tbukoyemtlhainumypmd.
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / ON CONFLICT).

-- 1. Add the columns the new /clients/* worker endpoints read and write.
--    (account_manager is the single source of truth the client pages, the
--    team portal, and the manager portal now all read from live.)
alter table public.clients add column if not exists account_manager text;
alter table public.clients add column if not exists display_name text;

-- 2. Backfill the 7 existing clients with their correct, current account
--    manager — taken from what's actually live on each client's own page
--    today (two of the old hardcoded team rosters had drifted out of sync
--    with this, which is exactly what prompted this fix).
update public.clients set account_manager = 'Louise',  display_name = 'OffGrid Pro'   where slug = 'offgridpro';
update public.clients set account_manager = 'Daniela', display_name = 'SCL'           where slug = 'scl';
update public.clients set account_manager = 'Daniela', display_name = 'Stjärnagloss'  where slug = 'stjarnagloss';
update public.clients set account_manager = 'Daniela', display_name = 'Aslotel'       where slug = 'aslotel';
update public.clients set account_manager = 'Imogen',  display_name = 'GFS'           where slug = 'gfs';
update public.clients set account_manager = 'Louise',  display_name = 'Autowatch'     where slug = 'autowatch';
update public.clients set account_manager = 'Louise',  display_name = 'AUTOID'        where slug = 'autoid';

-- 3. Create the two new clients Daniela asked for (both managed by Bethanie).
--    Adjust the slug here ONLY if you also change it in
--    scripts/build-client-profiles.js / login.html — they must match exactly.
insert into public.clients (slug, account_manager, display_name)
values
  ('bafmotorsport', 'Bethanie', 'BAF Motorsport'),
  ('ipps',           'Bethanie', 'Innovative Paint Protection Solutions')
on conflict (slug) do nothing;

-- 4. Create their login accounts so they can actually sign in.
--    Temporary passwords follow the same "Name-Tweak26" convention used for
--    Rob and Jeremy — both are flagged password_is_temporary so they're
--    forced to set their own password on first login.
--    NOTE: confirm 'client' is the correct role string your app_users table
--    uses for client (non-team) logins before running this — it's the only
--    assumption here I couldn't verify without direct database access.
insert into public.app_users (username, display_name, role, client_id, password_hash, password_is_temporary)
select 'BAFMotorsport', 'BAF Motorsport', 'client', c.id, crypt('BAFMotorsport-Tweak26', gen_salt('bf')), true
from public.clients c
where c.slug = 'bafmotorsport'
  and not exists (select 1 from public.app_users u where u.username = 'BAFMotorsport');

insert into public.app_users (username, display_name, role, client_id, password_hash, password_is_temporary)
select 'IPPS', 'Innovative Paint Protection Solutions', 'client', c.id, crypt('IPPS-Tweak26', gen_salt('bf')), true
from public.clients c
where c.slug = 'ipps'
  and not exists (select 1 from public.app_users u where u.username = 'IPPS');

-- Quick check afterwards:
-- select slug, display_name, account_manager from public.clients order by slug;
-- select username, role, client_id, password_is_temporary from public.app_users where username in ('BAFMotorsport','IPPS');
