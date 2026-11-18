// Pure helpers for user-provided API integrations (testable, no network).
import type { DiscoveredLead } from "./osm";
import {
  cleanText,
  isValidCnpj,
  normalizeCnpj,
  normalizeEmail,
  normalizeFacebook,
  normalizeInstagram,
  normalizeLinkedin,
  normalizePhone,
  normalizeUf,
  normalizeUrl,
  normalizeWhatsapp,
  validCoord,
} from "./normalize";

export type SearchVars = { niche: string; uf: string; city?: string | undefined; limit: number };

/** Replaces {niche} {uf} {city} {limit} placeholders (URL-encoded). */
export function fillTemplate(tpl: string, v: SearchVars) {
  const map: Record<string, string> = {
    niche: v.niche,
    uf: v.uf,
    city: v.city ?? "",
    limit: String(v.limit),
  };
  return tpl.replace(/\{(niche|uf|city|limit)\}/g, (_, k: string) =>
    encodeURIComponent(map[k] ?? ""),
  );
}

const MAX_ITEMS = 1000;

/** Finds the list of records: explicit dot path, the root array, or the first array property. */
export function extractItems(json: unknown, path?: string | null): Record<string, unknown>[] {
  let cur: unknown = json;
  if (path) {
    for (const p of path.split(".").filter(Boolean)) {
      if (p === "__proto__" || p === "constructor" || p === "prototype") return [];
      cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[p] : undefined;
    }
  }
  if (!Array.isArray(cur) && cur && typeof cur === "object") {
    cur = Object.values(cur).find(Array.isArray);
  }
  return Array.isArray(cur)
    ? cur
        .slice(0, MAX_ITEMS)
        .filter(
          (x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x),
        )
    : [];
}

const str = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = k.includes(".")
      ? k
          .split(".")
          .reduce<unknown>(
            (acc, p) =>
              acc && typeof acc === "object" ? (acc as Record<string, unknown>)[p] : undefined,
            o,
          )
      : o[k];
    if (v != null && v !== "" && (typeof v === "string" || typeof v === "number")) return String(v);
  }
  return null;
};

/** Maps a generic record to a lead using common field names. Missing data stays null. */
export function mapRecord(
  o: Record<string, unknown>,
  ctx: {
    niche: string;
    uf: string;
    city?: string | undefined;
    integrationId: string;
    index: number;
    providerName?: string;
  },
): DiscoveredLead | null {
  const name = cleanText(
    str(o, "name", "nome", "nome_fantasia", "razao_social", "title", "company", "empresa"),
    300,
  );
  if (!name) return null;
  const rawId = str(o, "id", "_id", "cnpj", "place_id", "uuid") ?? `${ctx.index}-${name}`;
  const cnpj = normalizeCnpj(str(o, "cnpj"));
  const pos = validCoord(
    str(o, "lat", "latitude", "location.lat", "geometry.location.lat"),
    str(o, "lng", "lon", "longitude", "location.lng", "location.lon", "geometry.location.lng"),
  );
  return {
    source: "api",
    source_id: `api:${ctx.integrationId}:${String(rawId).slice(0, 120)}`,
    name,
    niche: ctx.niche,
    address: cleanText(
      str(o, "address", "endereco", "logradouro", "formatted_address", "vicinity"),
    ),
    city: cleanText(str(o, "city", "cidade", "municipio"), 120) ?? ctx.city ?? null,
    state:
      normalizeUf(str(o, "state", "uf", "estado")) ??
      (ctx.uf === "BR" ? null : ctx.uf.toUpperCase()),
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    phone: normalizePhone(
      str(
        o,
        "phone",
        "telefone",
        "fone",
        "celular",
        "formatted_phone_number",
        "international_phone_number",
      ),
    ),
    email: normalizeEmail(str(o, "email", "e-mail", "mail")),
    website: normalizeUrl(str(o, "website", "site", "url")),
    instagram: normalizeInstagram(str(o, "instagram")),
    facebook: normalizeFacebook(str(o, "facebook")),
    linkedin: normalizeLinkedin(str(o, "linkedin")),
    whatsapp: normalizeWhatsapp(str(o, "whatsapp", "wpp")),
    cnpj: cnpj && isValidCnpj(cnpj) ? cnpj : null,
    verified_at: new Date().toISOString(),
    provider: ctx.providerName ?? "API personalizada",
  };
}
