import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { UFS } from "./constants";
import { buildOverpassQuery, dedupe, parseElement, parseNominatim, type NominatimPlace, type BBox, type DiscoveredLead, type OsmElement } from "./osm";
import { extractItems, fillTemplate, mapRecord, type SearchVars } from "./custom-api";

const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// Overpass mirrors rate-limit (HTTP 429) generic user agents.
const UA = "LeadHunterFree/1.1 (lead discovery app; contact: jadson@leadhunter.app)";

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

type Integration = {
  id: string; name: string; url: string; method: string;
  header_name: string | null; header_value: string | null; results_path: string | null;
};

async function callIntegration(it: Integration, vars: SearchVars) {
  const url = fillTemplate(it.url, vars);
  const headers: Record<string, string> = { accept: "application/json", "user-agent": UA };
  if (it.header_name && it.header_value) headers[it.header_name] = it.header_value;
  const init: RequestInit = { method: it.method, headers };
  if (it.method === "POST") {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(vars);
  }
  const res = await fetchWithTimeout(url, init, 20000);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error("resposta não é JSON"); }
  const items = extractItems(json, it.results_path)
    .map((o, i) => mapRecord(o, { ...vars, integrationId: it.id, index: i }))
    .filter((x): x is DiscoveredLead => !!x);
  return { items, sample: text.slice(0, 1500) };
}

export const searchLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        niche: z.string().trim().min(2).max(60),
        uf: z.string().length(2),
        city: z.string().trim().max(80).optional(),
        limit: z.number().int().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const vars: SearchVars = { ...data, city: data.city || undefined };
    const errors: string[] = [];

    // User's custom APIs run in parallel with OpenStreetMap.
    const { data: ints } = await context.supabase
      .from("api_integrations")
      .select("id,name,url,method,header_name,header_value,results_path")
      .eq("enabled", true)
      .eq("use_in_search", true);
    const customP = Promise.all(
      (ints ?? []).map(async (it) => {
        try { return (await callIntegration(it, vars)).items; }
        catch (e) { errors.push(`${it.name}: ${e instanceof Error ? e.message : "erro"}`); return []; }
      }),
    ).then((a) => a.flat());

    const osmP = (async () => {
      let bbox: BBox | undefined;
      if (vars.city) {
        try {
          const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&country=Brazil&state=${encodeURIComponent(data.uf)}&city=${encodeURIComponent(vars.city)}`;
          const r = await fetchWithTimeout(u, { headers: { "user-agent": UA } }, 10000);
          const j = (await r.json()) as { boundingbox?: string[] }[];
          const b = j[0]?.boundingbox?.map(Number);
          if (b && b.length === 4) bbox = [b[0]!, b[2]!, b[1]!, b[3]!];
        } catch { /* fall back to area query */ }
      }
      const query = buildOverpassQuery({ ...vars, bbox });
      const attempt = async (url: string) => {
        const host = new URL(url).host;
        try {
          const res = await fetchWithTimeout(url, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
            body: "data=" + encodeURIComponent(query),
          }, 85000);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
          if (!json.elements) throw new Error(json.remark ?? "resposta inválida");
          return { json: json as { elements: OsmElement[] }, host };
        } catch (e) {
          errors.push(`${host}: ${e instanceof Error ? e.message : "erro"}`);
          throw e;
        }
      };
      try {
        const { json, host } = await Promise.any(OVERPASS_ENDPOINTS.map(attempt));
        const items = json.elements
          .map((e) => parseElement(e, { niche: data.niche, uf: data.uf, city: vars.city }))
          .filter((x): x is DiscoveredLead => !!x);
        return { items, host };
      } catch {
        return { items: [] as DiscoveredLead[], host: null };
      }
    })();

    // Nominatim text search: fast fallback when Overpass mirrors are overloaded.
    const nomP = (async () => {
      const stateName = UFS.find(([s]) => s === data.uf.toUpperCase())?.[1] ?? data.uf;
      const q = `${data.niche} em ${vars.city ? vars.city + ", " : ""}${stateName}`;
      try {
        const r = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&addressdetails=1&extratags=1&countrycodes=br&q=${encodeURIComponent(q)}`, { headers: { "user-agent": UA } }, 15000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as NominatimPlace[];
        return j.filter((p) => !p.address?.["state"] || p.address["state"] === stateName)
          .map((p) => parseNominatim(p, { niche: data.niche, uf: data.uf, city: vars.city }))
          .filter((x): x is DiscoveredLead => !!x);
      } catch (e) {
        errors.push(`nominatim: ${e instanceof Error ? e.message : "erro"}`);
        return [] as DiscoveredLead[];
      }
    })();

    const [custom, osm, nom] = await Promise.all([customP, osmP, nomP]);
    const providers = [osm.host, nom.length ? "nominatim.openstreetmap.org" : null, ...(ints ?? []).filter((i) => !errors.some((e) => e.startsWith(i.name + ":"))).map((i) => i.name)].filter(Boolean);
    const items = dedupe([...custom, ...osm.items, ...nom]).slice(0, data.limit);
    return { items, provider: providers.length ? providers.join(" + ") : null, errors };
  });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), niche: z.string().max(60), uf: z.string().length(2), city: z.string().max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: it, error } = await context.supabase
      .from("api_integrations")
      .select("id,name,url,method,header_name,header_value,results_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !it) return { ok: false as const, error: "Integração não encontrada" };
    try {
      const r = await callIntegration(it, { niche: data.niche, uf: data.uf, city: data.city || undefined, limit: 10 });
      return { ok: true as const, count: r.items.length, preview: r.items.slice(0, 5).map((l) => l.name), sample: r.sample };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Falha" };
    }
  });

export const lookupCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cnpj: z.string().regex(/^\d{14}$/) }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetchWithTimeout(`https://brasilapi.com.br/api/cnpj/v1/${data.cnpj}`, {}, 15000);
    if (!res.ok) return { ok: false as const, error: res.status === 404 ? "CNPJ não encontrado" : `BrasilAPI HTTP ${res.status}` };
    const j = (await res.json()) as Record<string, unknown>;
    const s = (k: string) => (j[k] == null || j[k] === "" ? null : String(j[k]));
    const address = [s("descricao_tipo_de_logradouro"), s("logradouro"), s("numero"), s("bairro"), s("cep")]
      .filter(Boolean)
      .join(", ");
    return {
      ok: true as const,
      data: {
        legal_name: s("razao_social"),
        trade_name: s("nome_fantasia"),
        cnae: [s("cnae_fiscal"), s("cnae_fiscal_descricao")].filter(Boolean).join(" - ") || null,
        address: address || null,
        city: s("municipio"),
        state: s("uf"),
        phone: s("ddd_telefone_1"),
        email: s("email"),
        situacao: s("descricao_situacao_cadastral"),
      },
    };
  });
