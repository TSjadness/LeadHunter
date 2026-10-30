import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildOverpassQuery, dedupe, parseElement, type OsmElement } from "./osm";

const OVERPASS_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
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
    for (const url of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              "user-agent": "LeadHunterFree/1.0",
            },
            body: "data=" + encodeURIComponent(query),
          },
          30000,
        );
        if (!res.ok) {
          errors.push(`${new URL(url).host}: HTTP ${res.status}`);
          continue;
        }
        const json = (await res.json()) as { elements: OsmElement[] };
        const items = dedupe(
          json.elements
            .map((e) => parseElement(e, { niche: data.niche, uf: data.uf, city: data.city || undefined }))
            .filter((x): x is NonNullable<typeof x> => !!x),
        ).slice(0, data.limit);
        return { items, provider: new URL(url).host, errors };
      } catch (e) {
        errors.push(`${new URL(url).host}: ${e instanceof Error ? e.message : "erro"}`);
      }
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
