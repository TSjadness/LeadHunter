// Lead writes that need server-side validation and duplicate detection (search results
// and spreadsheet imports). Runs with the caller's JWT, so RLS still isolates users.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TablesInsert } from "@/integrations/supabase/types";
import { findDuplicate, type MatchReason, type Matchable } from "./dedupe";
import { AppError, dbErrorMessage, runSafely } from "./errors";
import { dbNameKey } from "./normalize";
import { saveLeadsInputSchema, type LeadFields } from "./schemas";

export type SaveLeadsResult = {
  inserted: { id: string; name: string; source_id: string | null }[];
  duplicates: {
    name: string;
    /** Provider id of the submitted item, so the client can map it back precisely. */
    source_id: string | null;
    existingId: string | null;
    reason: MatchReason | "batch" | "db";
  }[];
};

type Existing = Matchable & { id: string };

const EXISTING_COLUMNS = "id,name,source,source_id,cnpj,city,address,lat,lng,phone";
const chunk = <T>(a: T[], n: number) =>
  Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

function toInsert(v: LeadFields): TablesInsert<"leads"> {
  // Only defined, non-null keys; ownership/id/timestamps are always set by the database.
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) if (val !== undefined && val !== null) out[k] = val;
  out["source"] ??= "manual";
  return out as TablesInsert<"leads">;
}

export const saveLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveLeadsInputSchema.parse(d))
  .handler(({ data, context }) =>
    runSafely("saveLeads", async (): Promise<SaveLeadsResult> => {
      const { serverConfig } = await import("./server/env.server");
      const { enforceRateLimit } = await import("./server/rate-limit.server");
      const sb = context.supabase;
      await enforceRateLimit(sb, context.userId, "writes", serverConfig.rateLimit.writesPerMinute);

      // Candidate existing rows: same provider id, same CNPJ or same name (index-backed).
      const items = data.items;
      const sourceIds = [...new Set(items.map((i) => i.source_id).filter((x): x is string => !!x))];
      const cnpjs = [...new Set(items.map((i) => i.cnpj).filter((x): x is string => !!x))];
      const nameKeys = [...new Set(items.map((i) => dbNameKey(i.name)))];
      const existing: Existing[] = [];
      const load = async (col: "source_id" | "cnpj" | "name_key", values: string[]) => {
        for (const part of chunk(values, 80)) {
          const { data: rows, error } = await sb
            .from("leads")
            .select(EXISTING_COLUMNS)
            .in(col, part);
          if (error) throw new AppError("INTERNAL", dbErrorMessage(error));
          existing.push(...(rows as Existing[]));
        }
      };
      await Promise.all([
        load("source_id", sourceIds),
        load("cnpj", cnpjs),
        load("name_key", nameKeys),
      ]);

      const result: SaveLeadsResult = { inserted: [], duplicates: [] };
      const toWrite: LeadFields[] = [];
      const accepted: Matchable[] = [];
      for (const it of items) {
        const dbDup = findDuplicate(it, existing);
        if (dbDup) {
          result.duplicates.push({
            name: it.name,
            source_id: it.source_id ?? null,
            existingId: dbDup.match.id,
            reason: dbDup.reason,
          });
          continue;
        }
        if (findDuplicate(it, accepted)) {
          result.duplicates.push({
            name: it.name,
            source_id: it.source_id ?? null,
            existingId: null,
            reason: "batch",
          });
          continue;
        }
        accepted.push(it);
        toWrite.push(it);
      }

      for (const part of chunk(toWrite, 100)) {
        const { data: rows, error } = await sb
          .from("leads")
          .insert(part.map(toInsert))
          .select("id,name,source_id");
        if (!error) {
          result.inserted.push(...(rows ?? []));
          continue;
        }
        if (error.code !== "23505") throw new AppError("INTERNAL", dbErrorMessage(error));
        // A concurrent write created one of these rows: insert one by one to isolate it.
        for (const one of part) {
          const r = await sb
            .from("leads")
            .insert(toInsert(one))
            .select("id,name,source_id")
            .single();
          if (r.error?.code === "23505")
            result.duplicates.push({
              name: one.name,
              source_id: one.source_id ?? null,
              existingId: null,
              reason: "db",
            });
          else if (r.error) throw new AppError("INTERNAL", dbErrorMessage(r.error));
          else result.inserted.push(r.data);
        }
      }
      return result;
    }),
  );
