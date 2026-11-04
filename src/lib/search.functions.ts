import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildOverpassQuery, dedupe, parseElement, type OsmElement } from "./osm";

const OVERPASS_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
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
  .handler(async ({ data }) => {
    const query = buildOverpassQuery({ ...data, city: data.city || undefined });
    const errors: string[] = [];
    // Query all providers in parallel; first valid answer wins (fallback without blocking).
    const attempt = async (url: string) => {
      const host = new URL(url).host;
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "LeadHunterFree/1.0" },
            body: "data=" + encodeURIComponent(query),
          },
          60000,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { elements: OsmElement[] };
        return { json, host };
      } catch (e) {
        errors.push(`${host}: ${e instanceof Error ? e.message : "erro"}`);
        throw e;
      }
    };
    try {
      const { json, host } = await Promise.any(OVERPASS_ENDPOINTS.map(attempt));
      const items = dedupe(
        json.elements
          .map((e) => parseElement(e, { niche: data.niche, uf: data.uf, city: data.city || undefined }))
          .filter((x): x is NonNullable<typeof x> => !!x),
      ).slice(0, data.limit);
      return { items, provider: host, errors };
    } catch {
      /* all failed */
    }
    return { items: [], provider: null, errors };
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
