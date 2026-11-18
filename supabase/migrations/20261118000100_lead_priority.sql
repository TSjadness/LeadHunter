-- LeadHunter — lead priority (additive, idempotent).
-- 1 = baixa, 2 = média (default), 3 = alta. Stored as a number so "alta first" is a plain
-- ORDER BY priority DESC. Existing rows get 2 (média); nothing else changes.
-- Access is covered by the existing table grants and the "leads_own" RLS policy.

alter table public.leads
  add column if not exists priority smallint not null default 2;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_priority_check' and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_priority_check check (priority between 1 and 3);
  end if;
end $$;

comment on column public.leads.priority is '1 = baixa, 2 = média, 3 = alta';

-- Filters/sorting in "Meus leads" (always scoped by user_id through RLS).
create index if not exists leads_user_priority
  on public.leads (user_id, priority desc, created_at desc);
