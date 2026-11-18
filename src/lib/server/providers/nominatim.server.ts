// Nominatim (OpenStreetMap geocoder). The public instance allows at most 1 request per
// second for the whole application, so every call waits for a global slot first and
// results are cached. Used for the city bounding box and as a text-search fallback.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ufName } from "../../constants";
import {
  nominatimInState,
  nominatimQueries,
  parseNominatim,
  type BBox,
  type DiscoveredLead,
  type NominatimPlace,
} from "../../osm";
import { serverConfig } from "../env.server";
import { waitProviderSlot } from "../rate-limit.server";
import { OutboundError, providerFetch } from "../safe-fetch.server";
import { TtlCache } from "../cache.server";

const bboxCache = new TtlCache<BBox | null>(24 * 60 * 60_000, 500);
const searchCache = new TtlCache<DiscoveredLead[]>(10 * 60_000, 100);

async function call(supabase: SupabaseClient<Database>, path: string, signal?: AbortSignal) {
  const cfg = serverConfig.nominatim;
  const ok = await waitProviderSlot(supabase, "nominatim", cfg.minIntervalMs, signal);
  if (!ok) throw new OutboundError("serviço ocupado no momento");
  const email = serverConfig.contactEmail;
  const url = `${cfg.baseUrl}${path}${email ? `&email=${encodeURIComponent(email)}` : ""}`;
  const res = await providerFetch(url, {
    headers: { accept: "application/json", "accept-language": "pt-BR" },
    timeoutMs: cfg.timeoutMs,
    maxBytes: 5_000_000,
    ...(signal ? { signal } : {}),
  });
  if (!res.ok)
    throw new OutboundError(
      res.status === 429 ? "limite de uso atingido (429)" : `HTTP ${res.status}`,
      res.status,
    );
  return JSON.parse(res.text) as NominatimPlace[];
}

/** Bounding box of a municipality (south, west, north, east) or null if not found. */
export async function cityBBox(
  supabase: SupabaseClient<Database>,
  uf: string,
  city: string,
  signal?: AbortSignal,
): Promise<BBox | null> {
  const key = `${uf}|${city.toLowerCase()}`;
  const hit = bboxCache.get(key);
  if (hit !== undefined) return hit;
  const j = await call(
    supabase,
    `/search?format=json&limit=1&country=Brazil&state=${encodeURIComponent(ufName(uf))}&city=${encodeURIComponent(city)}`,
    signal,
  );
  const b = j[0]?.boundingbox?.map(Number);
  const bbox: BBox | null =
    b && b.length === 4 && b.every(Number.isFinite) ? [b[0]!, b[2]!, b[1]!, b[3]!] : null;
  bboxCache.set(key, bbox);
  return bbox;
}

/**
 * Place search. Nominatim does not understand "dentista em Campinas, São Paulo", so we try
 * (1) the OSM category phrase ("dentist in Campinas"), which is precise, then (2) the plain
 * words ("dentista Campinas"). Each query waits for the global 1 req/s slot.
 */
export async function nominatimSearch(
  supabase: SupabaseClient<Database>,
  input: { niche: string; uf: string; city?: string | undefined },
  signal?: AbortSignal,
): Promise<DiscoveredLead[]> {
  const where = input.uf === "BR" ? "Brasil" : ufName(input.uf);
  const queries = nominatimQueries(input.niche, input.city ?? where);
  const key = queries.join("|") + `|${input.uf}`;
  const hit = searchCache.get(key);
  if (hit) return hit.map((i) => ({ ...i }));
  const seen = new Set<string>();
  const items: DiscoveredLead[] = [];
  for (const q of queries) {
    const j = await call(
      supabase,
      `/search?format=jsonv2&limit=40&addressdetails=1&extratags=1&countrycodes=br&q=${encodeURIComponent(q)}`,
      signal,
    );
    for (const p of j) {
      if (!nominatimInState(p, input.uf, where)) continue;
      const lead = parseNominatim(p, input);
      if (lead && !seen.has(lead.source_id)) {
        seen.add(lead.source_id);
        items.push(lead);
      }
    }
    if (items.length >= 10) break;
  }
  searchCache.set(key, items);
  return items;
}
