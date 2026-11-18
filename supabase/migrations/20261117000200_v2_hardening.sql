-- =====================================================================================
-- LeadHunter v2 — security hardening, status history, settings and rate limiting.
--
-- NON-DESTRUCTIVE: only adds columns, tables, indexes, constraints, policies and
-- functions. No row is deleted. New CHECK constraints are created NOT VALID, so legacy
-- rows that break them are kept (new writes are validated). Safe to run more than once.
-- Rollback: supabase/rollback/20261117000200_v2_hardening.down.sql (read it first).
-- =====================================================================================

-- ---------------------------------------------------------------- 1. leads columns
alter table public.leads add column if not exists whatsapp text;
alter table public.leads add column if not exists linkedin text;
alter table public.leads add column if not exists status_changed_at timestamptz;
alter table public.leads add column if not exists name_key text
  generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored;

-- Backfill without touching updated_at (the touch trigger would overwrite it).
alter table public.leads disable trigger leads_touch;
update public.leads
   set status_changed_at = case when status = 'novo' then created_at else coalesce(updated_at, created_at) end
 where status_changed_at is null;
alter table public.leads enable trigger leads_touch;
alter table public.leads alter column status_changed_at set default now();

-- ---------------------------------------------------------------- 2. integrity rules
-- NOT VALID: enforced for new/updated rows, legacy rows are left untouched.
do $$ begin
  alter table public.leads add constraint leads_status_check
    check (status in ('novo', 'contato', 'negociacao', 'ganho', 'perdido')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_name_check
    check (char_length(btrim(name)) between 1 and 300) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_state_check
    check (state is null or state ~ '^[A-Z]{2}$') not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_cnpj_check
    check (cnpj is null or cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$') not valid; -- numeric or alphanumeric (2026+) CNPJ
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_coords_check
    check ((lat is null or lat between -90 and 90) and (lng is null or lng between -180 and 180)) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_revenue_check
    check (revenue is null or revenue >= 0) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leads add constraint leads_text_len_check
    check (char_length(coalesce(notes, '')) <= 10000
       and char_length(coalesce(address, '')) <= 500
       and char_length(coalesce(email, '')) <= 320
       and char_length(coalesce(website, '')) <= 500) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.interactions add constraint interactions_kind_check
    check (kind in ('nota', 'ligação', 'whatsapp', 'e-mail', 'reunião')) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.interactions add constraint interactions_content_check
    check (char_length(btrim(content)) between 1 and 5000) not valid;
exception when duplicate_object then null; end $$;

alter table public.collections add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.collections add constraint collections_name_check
    check (char_length(btrim(name)) between 1 and 120 and char_length(coalesce(description, '')) <= 1000) not valid;
exception when duplicate_object then null; end $$;

alter table public.api_integrations add column if not exists secret_ciphertext text;
alter table public.api_integrations add column if not exists updated_at timestamptz not null default now();
do $$ begin
  alter table public.api_integrations add constraint api_integrations_shape_check
    check (method in ('GET', 'POST')
       and char_length(btrim(name)) between 1 and 80
       and char_length(url) <= 2000
       and url ~* '^https?://'
       and char_length(coalesce(header_name, '')) <= 100
       and char_length(coalesce(results_path, '')) <= 200
       and (secret_ciphertext is null or secret_ciphertext like 'v1:%')) not valid;
exception when duplicate_object then null; end $$;

-- Ownership: tie every row to a real auth user (cascade on account deletion).
do $$ begin
  alter table public.leads add constraint leads_user_fk
    foreign key (user_id) references auth.users(id) on delete cascade not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.collections add constraint collections_user_fk
    foreign key (user_id) references auth.users(id) on delete cascade not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.collection_leads add constraint collection_leads_user_fk
    foreign key (user_id) references auth.users(id) on delete cascade not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.interactions add constraint interactions_user_fk
    foreign key (user_id) references auth.users(id) on delete cascade not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.api_integrations add constraint api_integrations_user_fk
    foreign key (user_id) references auth.users(id) on delete cascade not valid;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- 3. indexes
create index if not exists leads_user_created on public.leads (user_id, created_at desc);
create index if not exists leads_user_name_key on public.leads (user_id, name_key);
create index if not exists leads_user_city on public.leads (user_id, city);
create index if not exists leads_user_status_changed on public.leads (user_id, status, status_changed_at desc);
create index if not exists interactions_lead_created on public.interactions (lead_id, created_at desc);
create index if not exists interactions_user on public.interactions (user_id);
create index if not exists collection_leads_lead on public.collection_leads (lead_id);
create index if not exists collection_leads_user on public.collection_leads (user_id);
create index if not exists api_integrations_user on public.api_integrations (user_id, created_at);

-- One CNPJ per user. If legacy duplicates exist, fall back to a plain index (the app
-- still de-duplicates by CNPJ) instead of failing the migration.
do $$ begin
  create unique index if not exists leads_user_cnpj_unique on public.leads (user_id, cnpj) where cnpj is not null;
exception when unique_violation then
  raise notice 'leads: CNPJs duplicados encontrados; criando índice não único.';
  create index if not exists leads_user_cnpj on public.leads (user_id, cnpj) where cnpj is not null;
end $$;

-- ---------------------------------------------------------------- 4. status history
create table if not exists public.lead_status_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_status text,
  to_status text not null,
  backfilled boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lead_status_events_user_to on public.lead_status_events (user_id, to_status, created_at desc);
create index if not exists lead_status_events_lead on public.lead_status_events (lead_id, created_at desc);
alter table public.lead_status_events enable row level security;
revoke all on public.lead_status_events from anon, authenticated;
grant select on public.lead_status_events to authenticated;
grant all on public.lead_status_events to service_role;
drop policy if exists "lead_status_events_select_own" on public.lead_status_events;
create policy "lead_status_events_select_own" on public.lead_status_events
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.leads_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := coalesce(new.status_changed_at, now());
  else
    new.user_id := old.user_id; -- ownership never changes
    if new.status is distinct from old.status then
      new.status_changed_at := now();
    end if;
  end if;
  return new;
end $$;

-- SECURITY DEFINER: users can read but never write the history directly.
create or replace function public.leads_track_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_status_events (user_id, lead_id, from_status, to_status)
    values (new.user_id, new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.lead_status_events (user_id, lead_id, from_status, to_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  return null;
end $$;
revoke execute on function public.leads_track_status() from public, anon, authenticated;

drop trigger if exists leads_before_write on public.leads;
create trigger leads_before_write before insert or update on public.leads
  for each row execute function public.leads_before_write();
drop trigger if exists leads_track_status on public.leads;
create trigger leads_track_status after insert or update of status on public.leads
  for each row execute function public.leads_track_status();

-- Backfill one event per existing lead (flagged, so reports can tell estimates apart).
insert into public.lead_status_events (user_id, lead_id, from_status, to_status, backfilled, created_at)
select l.user_id, l.id, null, l.status, true,
       case when l.status = 'novo' then l.created_at else coalesce(l.updated_at, l.created_at) end
  from public.leads l
 where not exists (select 1 from public.lead_status_events e where e.lead_id = l.id);

drop trigger if exists collections_touch on public.collections;
create trigger collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();
drop trigger if exists api_integrations_touch on public.api_integrations;
create trigger api_integrations_touch before update on public.api_integrations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- 5. user settings
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  default_uf text check (default_uf is null or default_uf ~ '^[A-Z]{2}$'),
  default_city text check (default_city is null or char_length(default_city) <= 80),
  providers jsonb not null default '{}'::jsonb check (jsonb_typeof(providers) = 'object'),
  search_guide_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant all on public.user_settings to service_role;
drop policy if exists "user_settings_own" on public.user_settings;
create policy "user_settings_own" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- 6. RLS hardening
-- Child rows must point at parents owned by the same user (previously only user_id
-- was checked, so a row could reference someone else's lead/collection id).
alter table public.leads enable row level security;
alter table public.collections enable row level security;
alter table public.collection_leads enable row level security;
alter table public.interactions enable row level security;
alter table public.api_integrations enable row level security;

revoke all on public.leads, public.collections, public.collection_leads,
              public.interactions, public.api_integrations from anon;

drop policy if exists "own leads" on public.leads;
drop policy if exists "leads_own" on public.leads;
create policy "leads_own" on public.leads for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own collections" on public.collections;
drop policy if exists "collections_own" on public.collections;
create policy "collections_own" on public.collections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "own collection_leads" on public.collection_leads;
drop policy if exists "collection_leads_select" on public.collection_leads;
drop policy if exists "collection_leads_insert" on public.collection_leads;
drop policy if exists "collection_leads_update" on public.collection_leads;
drop policy if exists "collection_leads_delete" on public.collection_leads;
create policy "collection_leads_select" on public.collection_leads for select to authenticated
  using (user_id = (select auth.uid()));
create policy "collection_leads_insert" on public.collection_leads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid()))
  );
create policy "collection_leads_update" on public.collection_leads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid()))
  );
create policy "collection_leads_delete" on public.collection_leads for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "own interactions" on public.interactions;
drop policy if exists "interactions_select" on public.interactions;
drop policy if exists "interactions_insert" on public.interactions;
drop policy if exists "interactions_update" on public.interactions;
drop policy if exists "interactions_delete" on public.interactions;
create policy "interactions_select" on public.interactions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "interactions_insert" on public.interactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid()))
  );
create policy "interactions_update" on public.interactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.leads l where l.id = lead_id and l.user_id = (select auth.uid()))
  );
create policy "interactions_delete" on public.interactions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "own integrations" on public.api_integrations;
drop policy if exists "api_integrations_own" on public.api_integrations;
create policy "api_integrations_own" on public.api_integrations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- 7. rate limiting
-- Only the SECURITY DEFINER functions below touch these tables (RLS on, no policies).
create table if not exists public.rate_limit_hits (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_hits_lookup on public.rate_limit_hits (user_id, bucket, created_at desc);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;
grant all on public.rate_limit_hits to service_role;

create table if not exists public.provider_throttle (
  provider text primary key,
  next_slot timestamptz not null default now()
);
alter table public.provider_throttle enable row level security;
revoke all on public.provider_throttle from anon, authenticated;
grant all on public.provider_throttle to service_role;

-- Returns true and records a hit when the caller is under p_max hits in the window.
-- Buckets and limits are bounded so a client calling it directly cannot bloat the table.
create or replace function public.consume_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then return false; end if;
  if p_bucket not in ('search', 'cnpj', 'integration_test', 'writes', 'geocode')
     or p_max not between 1 and 1000 or p_window_seconds not between 1 and 3600 then
    raise exception 'invalid rate limit arguments';
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || ':' || p_bucket));
  delete from public.rate_limit_hits
   where user_id = uid and bucket = p_bucket and created_at < now() - interval '1 hour';
  select count(*) into used from public.rate_limit_hits
   where user_id = uid and bucket = p_bucket and created_at > now() - make_interval(secs => p_window_seconds);
  if used >= p_max then return false; end if;
  insert into public.rate_limit_hits (user_id, bucket) values (uid, p_bucket);
  return true;
end $$;
revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated, service_role;

-- Global (all users) pacing for free providers such as Nominatim (1 req/s policy).
-- Returns how many ms the caller must wait before calling, or -1 when the queue is
-- already >5s long (the caller should skip the provider instead of piling on).
create or replace function public.acquire_provider_slot(p_provider text, p_interval_ms integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  slot timestamptz;
  now_ts timestamptz := clock_timestamp();
begin
  if auth.uid() is null then return -1; end if;
  if p_provider not in ('nominatim', 'overpass', 'brasilapi') or p_interval_ms not between 100 and 60000 then
    raise exception 'invalid provider slot arguments';
  end if;
  if not public.consume_rate_limit('geocode', 60, 60) then return -1; end if;
  insert into public.provider_throttle (provider, next_slot) values (p_provider, now_ts)
    on conflict (provider) do nothing;
  select next_slot into slot from public.provider_throttle where provider = p_provider for update;
  if slot > now_ts + interval '5 seconds' then return -1; end if;
  slot := greatest(slot, now_ts);
  update public.provider_throttle
     set next_slot = slot + make_interval(secs => p_interval_ms / 1000.0)
   where provider = p_provider;
  return greatest(0, ceil(extract(epoch from (slot - now_ts)) * 1000))::integer;
end $$;
revoke execute on function public.acquire_provider_slot(text, integer) from public, anon;
grant execute on function public.acquire_provider_slot(text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------- 8. dashboard aggregate
-- SECURITY INVOKER: runs under the caller's RLS, so it only ever sees their rows.
create or replace function public.lead_dashboard(p_weeks integer default 12)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with params as (
    select least(greatest(coalesce(p_weeks, 12), 1), 52) as weeks, (select auth.uid()) as uid
  ),
  l as (select * from public.leads where user_id = (select uid from params)),
  weeks as (
    select generate_series(
      date_trunc('week', now()) - make_interval(weeks => (select weeks from params) - 1),
      date_trunc('week', now()),
      interval '1 week') as week
  ),
  won as (
    select date_trunc('week', e.created_at) as week, count(*) as n, count(*) filter (where e.backfilled) as est
      from public.lead_status_events e
     where e.user_id = (select uid from params) and e.to_status = 'ganho'
       and e.created_at >= (select min(week) from weeks)
     group by 1
  ),
  created as (
    select date_trunc('week', created_at) as week, count(*) as n
      from l where created_at >= (select min(week) from weeks) group by 1
  )
  select jsonb_build_object(
    'total', (select count(*) from l),
    'with_phone', (select count(*) from l where coalesce(phone, '') <> ''),
    'with_email', (select count(*) from l where coalesce(email, '') <> ''),
    'with_website', (select count(*) from l where coalesce(website, '') <> ''),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from l group by status) s), '{}'::jsonb),
    'by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) as n from l group by source) s), '{}'::jsonb),
    'top_cities', coalesce((
      select jsonb_agg(jsonb_build_object('city', city, 'state', state, 'count', n) order by n desc, city)
        from (select city, state, count(*) as n from l where coalesce(city, '') <> ''
               group by city, state order by n desc, city limit 5) c), '[]'::jsonb),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object(
               'week', to_char(w.week, 'YYYY-MM-DD'),
               'won', coalesce(won.n, 0),
               'won_estimated', coalesce(won.est, 0),
               'created', coalesce(created.n, 0)) order by w.week)
        from weeks w
        left join won on won.week = w.week
        left join created on created.week = w.week), '[]'::jsonb)
  );
$$;
revoke execute on function public.lead_dashboard(integer) from public, anon;
grant execute on function public.lead_dashboard(integer) to authenticated, service_role;
