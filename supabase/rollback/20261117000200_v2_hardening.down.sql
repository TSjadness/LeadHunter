-- =====================================================================================
-- ROLLBACK of 20261117000200_v2_hardening.sql — run MANUALLY, only if really needed.
--
-- ⚠️  This DROPS v2 data: status history (lead_status_events), user_settings,
--     rate-limit tables and the new lead columns (whatsapp, linkedin, status_changed_at).
--     Encrypted integration secrets (secret_ciphertext) are also dropped, so integrations
--     that used an auth header will need the key re-entered.
--     Take a backup first:  supabase db dump --data-only -f backup.sql
--
-- After running it, the app code must also be rolled back to the v1 version.
-- =====================================================================================
begin;

drop function if exists public.lead_dashboard(integer);
drop function if exists public.acquire_provider_slot(text, integer);
drop function if exists public.consume_rate_limit(text, integer, integer);
drop table if exists public.provider_throttle;
drop table if exists public.rate_limit_hits;
drop table if exists public.user_settings;

drop trigger if exists leads_track_status on public.leads;
drop trigger if exists leads_before_write on public.leads;
drop function if exists public.leads_track_status();
drop function if exists public.leads_before_write();
drop table if exists public.lead_status_events;
drop trigger if exists collections_touch on public.collections;
drop trigger if exists api_integrations_touch on public.api_integrations;

-- Restore v1 policies (note: v1 interactions/collection_leads policies are weaker).
drop policy if exists "leads_own" on public.leads;
create policy "own leads" on public.leads for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "collections_own" on public.collections;
create policy "own collections" on public.collections for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "collection_leads_select" on public.collection_leads;
drop policy if exists "collection_leads_insert" on public.collection_leads;
drop policy if exists "collection_leads_update" on public.collection_leads;
drop policy if exists "collection_leads_delete" on public.collection_leads;
create policy "own collection_leads" on public.collection_leads for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "interactions_select" on public.interactions;
drop policy if exists "interactions_insert" on public.interactions;
drop policy if exists "interactions_update" on public.interactions;
drop policy if exists "interactions_delete" on public.interactions;
create policy "own interactions" on public.interactions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "api_integrations_own" on public.api_integrations;
create policy "own integrations" on public.api_integrations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads drop constraint if exists leads_name_check;
alter table public.leads drop constraint if exists leads_state_check;
alter table public.leads drop constraint if exists leads_cnpj_check;
alter table public.leads drop constraint if exists leads_coords_check;
alter table public.leads drop constraint if exists leads_revenue_check;
alter table public.leads drop constraint if exists leads_text_len_check;
alter table public.leads drop constraint if exists leads_user_fk;
alter table public.interactions drop constraint if exists interactions_kind_check;
alter table public.interactions drop constraint if exists interactions_content_check;
alter table public.interactions drop constraint if exists interactions_user_fk;
alter table public.collections drop constraint if exists collections_name_check;
alter table public.collections drop constraint if exists collections_user_fk;
alter table public.collection_leads drop constraint if exists collection_leads_user_fk;
alter table public.api_integrations drop constraint if exists api_integrations_shape_check;
alter table public.api_integrations drop constraint if exists api_integrations_user_fk;

drop index if exists public.leads_user_created;
drop index if exists public.leads_user_name_key;
drop index if exists public.leads_user_city;
drop index if exists public.leads_user_status_changed;
drop index if exists public.leads_user_cnpj_unique;
drop index if exists public.leads_user_cnpj;
drop index if exists public.interactions_lead_created;
drop index if exists public.interactions_user;
drop index if exists public.collection_leads_lead;
drop index if exists public.collection_leads_user;
drop index if exists public.api_integrations_user;

alter table public.leads drop column if exists name_key;
alter table public.leads drop column if exists status_changed_at;
alter table public.leads drop column if exists linkedin;
alter table public.leads drop column if exists whatsapp;
alter table public.collections drop column if exists updated_at;
alter table public.api_integrations drop column if exists secret_ciphertext;
alter table public.api_integrations drop column if exists updated_at;

commit;
