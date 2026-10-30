create table public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  legal_name text, trade_name text, cnpj text, cnae text,
  niche text, address text, city text, state text,
  lat double precision, lng double precision,
  phone text, email text, website text, instagram text, facebook text,
  status text not null default 'novo',
  revenue numeric, revenue_source text,
  notes text,
  source text not null default 'manual', source_id text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;
alter table public.leads enable row level security;
create policy "own leads" on public.leads for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null, description text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
grant select, insert, update, delete on public.collections to authenticated;
grant all on public.collections to service_role;
alter table public.collections enable row level security;
create policy "own collections" on public.collections for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.collection_leads (
  collection_id uuid not null references public.collections(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (collection_id, lead_id)
);
grant select, insert, update, delete on public.collection_leads to authenticated;
grant all on public.collection_leads to service_role;
alter table public.collection_leads enable row level security;
create policy "own collection_leads" on public.collection_leads for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null default 'nota',
  content text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.interactions to authenticated;
grant all on public.interactions to service_role;
alter table public.interactions enable row level security;
create policy "own interactions" on public.interactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();
create index leads_user_status on public.leads(user_id, status);