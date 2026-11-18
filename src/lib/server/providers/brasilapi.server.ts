// BrasilAPI CNPJ lookup (public Receita Federal data).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../../errors";
import { cleanText, normalizeEmail, normalizePhone, normalizeUf } from "../../normalize";
import { serverConfig } from "../env.server";
import { waitProviderSlot } from "../rate-limit.server";
import { providerFetch } from "../safe-fetch.server";
import { TtlCache } from "../cache.server";

export type CnpjData = {
  legal_name: string | null;
  trade_name: string | null;
  cnae: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  situacao: string | null;
};

const cache = new TtlCache<CnpjData>(6 * 60 * 60_000, 500);

export function mapBrasilApi(j: Record<string, unknown>): CnpjData {
  const s = (k: string) => cleanText(j[k], 300);
  const address = [
    s("descricao_tipo_de_logradouro"),
    s("logradouro"),
    s("numero"),
    s("complemento"),
    s("bairro"),
    s("cep"),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    legal_name: s("razao_social"),
    trade_name: s("nome_fantasia"),
    cnae: [s("cnae_fiscal"), s("cnae_fiscal_descricao")].filter(Boolean).join(" - ") || null,
    address: address || null,
    city: s("municipio"),
    state: normalizeUf(s("uf")),
    phone: normalizePhone(s("ddd_telefone_1")),
    email: normalizeEmail(s("email")),
    situacao: s("descricao_situacao_cadastral"),
  };
}

export async function lookupCnpjData(
  supabase: SupabaseClient<Database>,
  cnpj: string,
): Promise<CnpjData> {
  const cfg = serverConfig.brasilapi;
  if (!cfg.enabled)
    throw new AppError("CONFIG", "A consulta de CNPJ está desativada neste servidor.");
  const hit = cache.get(cnpj);
  if (hit) return hit;
  await waitProviderSlot(supabase, "brasilapi", 400);
  let res;
  try {
    res = await providerFetch(`${cfg.baseUrl}/api/cnpj/v1/${encodeURIComponent(cnpj)}`, {
      headers: { accept: "application/json" },
      timeoutMs: cfg.timeoutMs,
      maxBytes: 1_000_000,
    });
  } catch {
    throw new AppError("UPSTREAM", "A BrasilAPI não respondeu. Tente novamente em instantes.");
  }
  if (res.status === 404)
    throw new AppError("NOT_FOUND", "CNPJ não encontrado na Receita Federal.");
  if (res.status === 429)
    throw new AppError(
      "RATE_LIMITED",
      "A BrasilAPI limitou as consultas. Aguarde alguns segundos.",
    );
  if (!res.ok)
    throw new AppError("UPSTREAM", `A BrasilAPI está indisponível (HTTP ${res.status}).`);
  const data = mapBrasilApi(JSON.parse(res.text) as Record<string, unknown>);
  cache.set(cnpj, data);
  return data;
}
