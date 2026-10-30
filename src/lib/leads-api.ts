import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type Collection = Database["public"]["Tables"]["collections"]["Row"];
export type Interaction = Database["public"]["Tables"]["interactions"]["Row"];

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export const leadsQuery = queryOptions({
  queryKey: ["leads"],
  queryFn: async () =>
    check(await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(5000)) ?? [],
});

export const leadQuery = (id: string) =>
  queryOptions({
    queryKey: ["lead", id],
    queryFn: async () => check(await supabase.from("leads").select("*").eq("id", id).maybeSingle()),
  });

export const interactionsQuery = (leadId: string) =>
  queryOptions({
    queryKey: ["interactions", leadId],
    queryFn: async () =>
      check(
        await supabase.from("interactions").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
      ) ?? [],
  });

export const collectionsQuery = queryOptions({
  queryKey: ["collections"],
  queryFn: async () =>
    check(
      await supabase.from("collections").select("*, collection_leads(lead_id)").order("created_at", { ascending: true }),
    ) ?? [],
});

/** Inserts leads skipping duplicates (same source+source_id, or same cnpj, or same name+city). */
export async function saveLeads(items: LeadInsert[]) {
  const existing = check(await supabase.from("leads").select("id, source, source_id, cnpj, name, city").limit(5000)) ?? [];
  const keyOf = (l: { name: string; city?: string | null }) => `${l.name.toLowerCase().trim()}|${(l.city ?? "").toLowerCase()}`;
  const bySrc = new Map(existing.filter((e) => e.source_id).map((e) => [`${e.source}|${e.source_id}`, e.id]));
  const byCnpj = new Map(existing.filter((e) => e.cnpj).map((e) => [e.cnpj!, e.id]));
  const byName = new Map(existing.map((e) => [keyOf(e), e.id]));
  const toInsert: LeadInsert[] = [];
  const duplicateIds: string[] = [];
  const conflicts: string[] = [];
  for (const it of items) {
    const dup =
      (it.source_id && bySrc.get(`${it.source ?? "manual"}|${it.source_id}`)) ||
      (it.cnpj && byCnpj.get(it.cnpj)) ||
      byName.get(keyOf(it));
    if (dup) {
      duplicateIds.push(dup);
      conflicts.push(it.name);
      continue;
    }
    byName.set(keyOf(it), "pending");
    toInsert.push(it);
  }
  const inserted = toInsert.length
    ? (check(await supabase.from("leads").insert(toInsert).select("id")) ?? [])
    : [];
  return { inserted: inserted.map((i) => i.id), duplicateIds, conflicts };
}

export async function updateLead(id: string, patch: Partial<LeadInsert>) {
  return check(await supabase.from("leads").update(patch).eq("id", id).select().single());
}

export async function deleteLead(id: string) {
  check(await supabase.from("leads").delete().eq("id", id));
}

export async function createCollection(name: string) {
  return check(await supabase.from("collections").insert({ name: name.trim() }).select().single());
}

export async function addToCollection(collectionId: string, leadIds: string[]) {
  if (!leadIds.length) return;
  check(
    await supabase
      .from("collection_leads")
      .upsert(leadIds.map((lead_id) => ({ collection_id: collectionId, lead_id })), { ignoreDuplicates: true }),
  );
}

export async function removeFromCollection(collectionId: string, leadId: string) {
  check(await supabase.from("collection_leads").delete().eq("collection_id", collectionId).eq("lead_id", leadId));
}

export async function deleteCollection(id: string) {
  check(await supabase.from("collections").delete().eq("id", id));
}

export async function addInteraction(leadId: string, kind: string, content: string) {
  check(await supabase.from("interactions").insert({ lead_id: leadId, kind, content }));
}
