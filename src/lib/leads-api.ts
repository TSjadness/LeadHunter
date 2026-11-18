// Client data access for the authenticated user. Every query runs under RLS with the
// user's session; pagination, filtering, sorting and aggregation happen in Postgres.
import { infiniteQueryOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { KANBAN_PAGE_SIZE, LEADS_PAGE_SIZE, type LeadPriority, type LeadStatus } from "./constants";
import { AppError, unwrap } from "./errors";
import { collectionSchema, interactionSchema, leadPatchSchema } from "./schemas";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = TablesInsert<"leads">;
export type LeadUpdate = TablesUpdate<"leads">;
export type Collection = Database["public"]["Tables"]["collections"]["Row"];
export type Interaction = Database["public"]["Tables"]["interactions"]["Row"];
export type StatusEvent = Database["public"]["Tables"]["lead_status_events"]["Row"];

// ------------------------------------------------------------------ list / filters
export type LeadSort =
  "created_at" | "name" | "city" | "status_changed_at" | "updated_at" | "priority";
export type LeadFilters = {
  page: number;
  pageSize?: number | undefined;
  q?: string | undefined;
  statuses?: string[] | undefined;
  priorities?: number[] | undefined;
  city?: string | undefined;
  niche?: string | undefined;
  source?: string | undefined;
  hasPhone?: boolean | undefined;
  collectionId?: string | undefined;
  sort?: LeadSort | undefined;
  dir?: "asc" | "desc" | undefined;
};

/** Escapes user text for a PostgREST `or=(...ilike...)` filter (commas/parentheses are syntax). */
export function ilikeTerm(q: string) {
  const cleaned = q
    .replace(/[,()"\\]/g, " ")
    .replace(/[%_]/g, (m) => `\\${m}`)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned ? `*${cleaned}*` : "";
}

export const leadsKeys = {
  all: ["leads"] as const,
  list: (f: LeadFilters) => ["leads", "list", f] as const,
  one: (id: string) => ["leads", "one", id] as const,
  /** `collectionId` null = all leads. */
  kanban: (status: string, collectionId: string | null = null) =>
    ["leads", "kanban", status, collectionId ?? "all"] as const,
  dashboard: ["leads", "dashboard"] as const,
  facets: ["leads", "facets"] as const,
};

export const leadsListQuery = (f: LeadFilters) =>
  queryOptions({
    queryKey: leadsKeys.list(f),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const size = f.pageSize ?? LEADS_PAGE_SIZE;
      const from = (Math.max(1, f.page) - 1) * size;
      const select = f.collectionId ? "*, collection_leads!inner(collection_id)" : "*";
      let q = supabase.from("leads").select(select, { count: "exact" });
      if (f.collectionId) q = q.eq("collection_leads.collection_id", f.collectionId);
      const term = f.q ? ilikeTerm(f.q) : "";
      if (term) {
        const digits = f.q!.replace(/\D/g, "");
        q = q.or(
          [
            `name.ilike.${term}`,
            `city.ilike.${term}`,
            `niche.ilike.${term}`,
            ...(digits.length >= 4
              ? [`cnpj.ilike.*${digits}*`, `phone.ilike.*${digits.slice(-8)}*`]
              : []),
          ].join(","),
        );
      }
      if (f.statuses?.length) q = q.in("status", f.statuses);
      if (f.priorities?.length) q = q.in("priority", f.priorities);
      if (f.city) q = q.ilike("city", ilikeTerm(f.city).replace(/^\*|\*$/g, "%") || "%");
      if (f.niche) q = q.ilike("niche", `%${ilikeTerm(f.niche).replace(/^\*|\*$/g, "")}%`);
      if (f.source) q = q.eq("source", f.source);
      if (f.hasPhone) q = q.not("phone", "is", null);
      const sort = f.sort ?? "created_at";
      q = q.order(sort, {
        ascending: (f.dir ?? (sort === "name" || sort === "city" ? "asc" : "desc")) === "asc",
        nullsFirst: false,
      });
      if (sort !== "created_at") q = q.order("created_at", { ascending: false });
      const r = await q.range(from, from + size - 1);
      if (r.error) unwrap(r);
      return {
        rows: (r.data ?? []) as unknown as Lead[],
        total: r.count ?? 0,
        page: f.page,
        pageSize: size,
      };
    },
  });

export const leadQuery = (id: string) =>
  queryOptions({
    queryKey: leadsKeys.one(id),
    queryFn: async () =>
      unwrap(await supabase.from("leads").select("*").eq("id", id).maybeSingle()),
  });

export const interactionsQuery = (leadId: string) =>
  queryOptions({
    queryKey: ["interactions", leadId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("interactions")
          .select("*")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(200),
      ) ?? [],
  });

export const statusEventsQuery = (leadId: string) =>
  queryOptions({
    queryKey: ["status-events", leadId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("lead_status_events")
          .select("*")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(100),
      ) ?? [],
  });

// ------------------------------------------------------------------ kanban
export type KanbanPage = { rows: Lead[]; total: number; nextOffset: number | null };

const KANBAN_COLUMNS = "id,name,city,state,phone,status,niche,status_changed_at,priority";

export const kanbanColumnQuery = (status: LeadStatus, collectionId: string | null = null) =>
  infiniteQueryOptions({
    queryKey: leadsKeys.kanban(status, collectionId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<KanbanPage> => {
      // With a collection, an inner join keeps only its members (PK collection_id,lead_id).
      let q = supabase
        .from("leads")
        .select(
          collectionId ? `${KANBAN_COLUMNS},collection_leads!inner(collection_id)` : KANBAN_COLUMNS,
          { count: "exact" },
        )
        .eq("status", status);
      if (collectionId) q = q.eq("collection_leads.collection_id", collectionId);
      const r = await q
        .order("status_changed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(pageParam, pageParam + KANBAN_PAGE_SIZE - 1);
      if (r.error) unwrap(r);
      const rows = ((r.data ?? []) as unknown as (Lead & { collection_leads?: unknown })[]).map(
        ({ collection_leads: _c, ...l }) => l as Lead,
      );
      const next = pageParam + rows.length;
      return { rows, total: r.count ?? 0, nextOffset: next < (r.count ?? 0) ? next : null };
    },
    getNextPageParam: (last) => last.nextOffset,
  });

// ------------------------------------------------------------------ dashboard
export type Dashboard = {
  total: number;
  with_phone: number;
  with_email: number;
  with_website: number;
  by_status: Record<string, number>;
  by_source: Record<string, number>;
  top_cities: { city: string; state: string | null; count: number }[];
  weekly: { week: string; won: number; won_estimated: number; created: number }[];
};

export const dashboardQuery = queryOptions({
  queryKey: leadsKeys.dashboard,
  queryFn: async () => {
    const r = await supabase.rpc("lead_dashboard", { p_weeks: 12 });
    return unwrap(r) as unknown as Dashboard;
  },
});

// ------------------------------------------------------------------ writes
function clean<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function updateLead(id: string, patch: Record<string, unknown>) {
  const parsed = leadPatchSchema.safeParse(patch);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new AppError(
      "VALIDATION",
      `${String(i?.path[0] ?? "campo")}: ${i?.message ?? "inválido"}`,
    );
  }
  return unwrap(
    await supabase
      .from("leads")
      .update(clean(parsed.data) as LeadUpdate)
      .eq("id", id)
      .select()
      .single(),
  );
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  return unwrap(
    await supabase
      .from("leads")
      .update({ status })
      .eq("id", id)
      .select("id,status,status_changed_at")
      .single(),
  );
}

export async function bulkUpdateStatus(ids: string[], status: LeadStatus) {
  if (!ids.length) return;
  unwrap(await supabase.from("leads").update({ status }).in("id", ids));
}

export async function bulkUpdatePriority(ids: string[], priority: LeadPriority) {
  if (!ids.length) return;
  unwrap(await supabase.from("leads").update({ priority }).in("id", ids));
}

export async function deleteLeads(ids: string[]) {
  if (!ids.length) return;
  unwrap(await supabase.from("leads").delete().in("id", ids));
}

export async function addInteraction(leadId: string, kind: string, content: string) {
  const v = interactionSchema.parse({ lead_id: leadId, kind, content });
  unwrap(await supabase.from("interactions").insert(v));
}

export async function deleteInteraction(id: string) {
  unwrap(await supabase.from("interactions").delete().eq("id", id));
}

/** All leads (for export), fetched in pages of 1000 (the PostgREST default max). */
export async function fetchAllLeads(onProgress?: (n: number) => void): Promise<Lead[]> {
  const out: Lead[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    const rows = unwrap(r) ?? [];
    out.push(...rows);
    onProgress?.(out.length);
    if (rows.length < 1000) break;
  }
  return out;
}

// ------------------------------------------------------------------ collections
export type CollectionWithCount = Collection & { lead_count: number };

export const collectionsQuery = queryOptions({
  queryKey: ["collections"],
  queryFn: async (): Promise<CollectionWithCount[]> => {
    const rows =
      unwrap(
        await supabase
          .from("collections")
          .select("*, collection_leads(count)")
          .order("created_at", { ascending: true }),
      ) ?? [];
    return rows.map(({ collection_leads, ...c }) => ({
      ...c,
      lead_count: (collection_leads as unknown as { count: number }[])[0]?.count ?? 0,
    }));
  },
});

export const collectionQuery = (id: string) =>
  queryOptions({
    queryKey: ["collections", id],
    queryFn: async () =>
      unwrap(await supabase.from("collections").select("*").eq("id", id).maybeSingle()),
  });

export const leadCollectionsQuery = (leadId: string) =>
  queryOptions({
    queryKey: ["collections", "of-lead", leadId],
    queryFn: async () =>
      (
        unwrap(
          await supabase.from("collection_leads").select("collection_id").eq("lead_id", leadId),
        ) ?? []
      ).map((r) => r.collection_id),
  });

export async function createCollection(name: string, description?: string | null) {
  const v = collectionSchema.parse({ name, description });
  return unwrap(
    await supabase
      .from("collections")
      .insert({ name: v.name, description: v.description ?? null })
      .select()
      .single(),
  );
}

export async function updateCollection(id: string, name: string, description?: string | null) {
  const v = collectionSchema.parse({ name, description });
  return unwrap(
    await supabase
      .from("collections")
      .update({ name: v.name, description: v.description ?? null })
      .eq("id", id)
      .select()
      .single(),
  );
}

export async function deleteCollection(id: string) {
  unwrap(await supabase.from("collections").delete().eq("id", id));
}

export async function addToCollection(collectionId: string, leadIds: string[]) {
  if (!leadIds.length) return;
  for (let i = 0; i < leadIds.length; i += 500) {
    const part = leadIds.slice(i, i + 500);
    unwrap(
      await supabase.from("collection_leads").upsert(
        part.map((lead_id) => ({ collection_id: collectionId, lead_id })),
        { onConflict: "collection_id,lead_id", ignoreDuplicates: true },
      ),
    );
  }
}

/**
 * Refreshes every view that depends on collection membership: the collection list/counts,
 * leads lists filtered by collection and the (optionally filtered) Kanban.
 */
export function invalidateCollectionViews(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["collections"] }),
    qc.invalidateQueries({ queryKey: ["leads", "list"] }),
    qc.invalidateQueries({ queryKey: ["leads", "kanban"] }),
  ]);
}

export async function removeFromCollection(collectionId: string, leadIds: string[]) {
  if (!leadIds.length) return;
  unwrap(
    await supabase
      .from("collection_leads")
      .delete()
      .eq("collection_id", collectionId)
      .in("lead_id", leadIds),
  );
}

// ------------------------------------------------------------------ settings
export type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];

export const settingsQuery = queryOptions({
  queryKey: ["user-settings"],
  queryFn: async () => unwrap(await supabase.from("user_settings").select("*").maybeSingle()),
});

export async function saveSettings(patch: {
  default_uf?: string | null;
  default_city?: string | null;
  providers?: Json;
  search_guide_dismissed?: boolean;
}) {
  const { data: auth } = await supabase.auth.getSession();
  const uid = auth.session?.user.id;
  if (!uid) throw new AppError("UNAUTHORIZED", "Sua sessão expirou. Entre novamente.");
  return unwrap(
    await supabase
      .from("user_settings")
      .upsert({ user_id: uid, ...patch }, { onConflict: "user_id" })
      .select()
      .single(),
  );
}
