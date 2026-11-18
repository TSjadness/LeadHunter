-- Manual rollback of 20261118000100_lead_priority.sql.
-- ⚠️ Drops the priority values of every lead. Revert the app code first.
drop index if exists public.leads_user_priority;
alter table public.leads drop constraint if exists leads_priority_check;
alter table public.leads drop column if exists priority;
