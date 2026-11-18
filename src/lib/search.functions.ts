// Search server functions. The browser calls the OSM search and the custom-API search in
// parallel and merges results as each one arrives (progressive results). All network
// code lives in src/lib/server/** and is loaded only on the server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, runSafely } from "./errors";
import { mergeDuplicates } from "./dedupe";
import { normalizeCnpj, isValidCnpj } from "./normalize";
import type { DiscoveredLead } from "./osm";
import { searchInputSchema } from "./schemas";

export type ProviderStatus = {
  id: string;
  name: string;
  status: "ok" | "empty" | "error" | "skipped";
  count: number;
  message?: string;
};

export type SearchResult = {
  items: DiscoveredLead[];
  providers: ProviderStatus[];
  notices: string[];
};

type ProviderPrefs = { overpass?: boolean; nominatim?: boolean };

/**
 * Abort signal of the incoming HTTP request: it fires when the browser cancels the search
 * (or the tab goes away), so the providers stop instead of finishing work nobody will read.
 */
async function requestSignal(): Promise<AbortSignal | undefined> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    return getRequest().signal;
  } catch {
    return undefined;
  }
}

const friendly = (e: unknown) => {
  const m = e instanceof Error ? e.message : "";
  if (/tempo esgotado|timeout/i.test(m)) return "demorou demais para responder";
  if (/429|limite/i.test(m)) return "limite de uso atingido; tente em alguns minutos";
  if (/ocupado/i.test(m)) return "muito requisitado agora; tente novamente em instantes";
  return m && m.length < 140 ? m : "indisponível no momento";
};

export const searchOsm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchInputSchema.parse(d))
  .handler(({ data, context }) =>
    runSafely("searchOsm", async (): Promise<SearchResult> => {
      const { serverConfig } = await import("./server/env.server");
      const { enforceRateLimit } = await import("./server/rate-limit.server");
      const { overpassSearch } = await import("./server/providers/overpass.server");
      const { cityBBox, nominatimSearch } = await import("./server/providers/nominatim.server");
      const sb = context.supabase;
      const signal = await requestSignal();
      await enforceRateLimit(sb, context.userId, "search", serverConfig.rateLimit.searchPerMinute);

      const { data: settings } = await sb.from("user_settings").select("providers").maybeSingle();
      const prefs = (settings?.providers ?? {}) as ProviderPrefs;
      const useOverpass = serverConfig.overpass.enabled && prefs.overpass !== false;
      const useNominatim = serverConfig.nominatim.enabled && prefs.nominatim !== false;

      const providers: ProviderStatus[] = [];
      const notices: string[] = [];
      let items: DiscoveredLead[] = [];

      // 1) Overpass: structured, complete results for a state or city.
      if (data.uf === "BR") {
        providers.push({
          id: "overpass",
          name: "OpenStreetMap (Overpass)",
          status: "skipped",
          count: 0,
          message: "não usado na busca nacional (consulta pesada demais)",
        });
        notices.push(
          "Na busca em todo o Brasil usamos apenas a busca textual. Para resultados completos, escolha um estado.",
        );
      } else if (!useOverpass) {
        providers.push({
          id: "overpass",
          name: "OpenStreetMap (Overpass)",
          status: "skipped",
          count: 0,
          message: "desativado",
        });
      } else {
        let bbox;
        if (data.city && useNominatim) {
          try {
            bbox = (await cityBBox(sb, data.uf, data.city, signal)) ?? undefined;
            if (!bbox)
              notices.push(
                `Não localizamos o município "${data.city}". Verifique a grafia; buscamos pelo nome exato.`,
              );
          } catch {
            /* fall back to the administrative area query */
          }
        }
        if (signal?.aborted) throw new AppError("VALIDATION", "Busca cancelada.");
        const r = await overpassSearch({ ...data, bbox }, signal);
        items = r.items;
        providers.push(
          r.host
            ? {
                id: "overpass",
                name: "OpenStreetMap (Overpass)",
                status: r.items.length ? "ok" : "empty",
                count: r.items.length,
                ...(r.cached ? { message: "resultado em cache (10 min)" } : {}),
              }
            : {
                id: "overpass",
                name: "OpenStreetMap (Overpass)",
                status: "error",
                count: 0,
                message: friendly(new Error(r.errors.at(-1) ?? "")),
              },
        );
      }

      // 2) Nominatim text search: fallback/complement when Overpass failed or found few.
      const needMore = items.length < Math.min(data.limit, 20);
      if (signal?.aborted) throw new AppError("VALIDATION", "Busca cancelada.");
      if (useNominatim && needMore) {
        try {
          const nom = await nominatimSearch(sb, data, signal);
          const before = items.length;
          items = mergeDuplicates([...items, ...nom]);
          providers.push({
            id: "nominatim",
            name: "OpenStreetMap (Nominatim)",
            status: nom.length ? "ok" : "empty",
            count: items.length - before,
          });
        } catch (e) {
          providers.push({
            id: "nominatim",
            name: "OpenStreetMap (Nominatim)",
            status: "error",
            count: 0,
            message: friendly(e),
          });
        }
      } else {
        providers.push({
          id: "nominatim",
          name: "OpenStreetMap (Nominatim)",
          status: "skipped",
          count: 0,
          message: useNominatim ? "não foi necessário" : "desativado",
        });
      }

      return { items: mergeDuplicates(items).slice(0, data.limit), providers, notices };
    }),
  );

export const searchIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchInputSchema.parse(d))
  .handler(({ data, context }) =>
    runSafely("searchIntegrations", async (): Promise<SearchResult> => {
      const { serverConfig } = await import("./server/env.server");
      if (!serverConfig.integrations.enabled) return { items: [], providers: [], notices: [] };
      const { callIntegration, INTEGRATION_SERVER_COLUMNS } =
        await import("./server/providers/custom.server");
      const { enforceRateLimit } = await import("./server/rate-limit.server");
      const sb = context.supabase;
      const signal = await requestSignal();
      const { data: rows, error } = await sb
        .from("api_integrations")
        .select(INTEGRATION_SERVER_COLUMNS)
        .eq("enabled", true)
        .eq("use_in_search", true)
        .order("created_at")
        .limit(serverConfig.integrations.maxPerUser);
      if (error) throw new AppError("INTERNAL", "Não foi possível carregar suas integrações.");
      if (!rows?.length) return { items: [], providers: [], notices: [] };
      await enforceRateLimit(
        sb,
        context.userId,
        "search",
        serverConfig.rateLimit.searchPerMinute * 2,
      );
      const results = await Promise.all(
        rows.map(async (it) => {
          try {
            const r = await callIntegration(sb, it, { ...data, city: data.city }, signal);
            return {
              items: r.items,
              status: {
                id: `api:${it.id}`,
                name: it.name,
                status: r.items.length ? "ok" : "empty",
                count: r.items.length,
              } as ProviderStatus,
            };
          } catch (e) {
            return {
              items: [],
              status: {
                id: `api:${it.id}`,
                name: it.name,
                status: "error",
                count: 0,
                message: friendly(e),
              } as ProviderStatus,
            };
          }
        }),
      );
      return {
        items: mergeDuplicates(results.flatMap((r) => r.items)).slice(0, data.limit),
        providers: results.map((r) => r.status),
        notices: [],
      };
    }),
  );

export const lookupCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cnpj: z
          .string()
          .transform((c) => normalizeCnpj(c) ?? "")
          .refine(isValidCnpj, "CNPJ inválido (confira os dígitos)"),
      })
      .parse(d),
  )
  .handler(({ data, context }) =>
    runSafely("lookupCnpj", async () => {
      const { serverConfig } = await import("./server/env.server");
      const { enforceRateLimit } = await import("./server/rate-limit.server");
      const { lookupCnpjData } = await import("./server/providers/brasilapi.server");
      await enforceRateLimit(
        context.supabase,
        context.userId,
        "cnpj",
        serverConfig.rateLimit.cnpjPerMinute,
      );
      return lookupCnpjData(context.supabase, data.cnpj);
    }),
  );
