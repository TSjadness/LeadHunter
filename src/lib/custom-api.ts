// Pure helpers for user-provided API integrations (testable, no network).
import type { DiscoveredLead } from "./osm";

export type SearchVars = { niche: string; uf: string; city?: string | undefined; limit: number };

/** Replaces {niche} {uf} {city} {limit} placeholders (URL-encoded). */
export function fillTemplate(tpl: string, v: SearchVars) {
  const map: Record<string, string> = { niche: v.niche, uf: v.uf, city: v.city ?? "", limit: String(v.limit) };
  return tpl.replace(/\{(niche|uf|city|limit)\}/g, (_, k: string) => encodeURIComponent(map[k] ?? ""));
}

/** Finds the list of records: explicit dot path, the root array, or the first array property. */
export function extractItems(json: unknown, path?: string | null): Record<string, unknown>[] {
  let cur: unknown = json;
  if (path) for (const p of path.split(".").filter(Boolean)) cur = (cur as Record<string, unknown> | null)?.[p];
  if (!Array.isArray(cur) && cur && typeof cur === "object") {
    cur = Object.values(cur).find(Array.isArray);
  }
  return Array.isArray(cur) ? cur.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

const str = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (v != null && v !== "" && (typeof v === "string" || typeof v === "number")) return String(v);
  }
  return null;
};
const num = (s: string | null) => (s != null && !Number.isNaN(Number(s)) ? Number(s) : null);

/** Maps a generic record to a lead using common field names. Missing data stays null. */
export function mapRecord(o: Record<string, unknown>, ctx: { niche: string; uf: string; city?: string | undefined; integrationId: string; index: number }): DiscoveredLead | null {
  const name = str(o, "name", "nome", "nome_fantasia", "razao_social", "title", "company", "empresa");
  if (!name) return null;
  const id = str(o, "id", "_id", "cnpj", "place_id") ?? `${ctx.index}-${name}`;
  return {
    source: "api",
    source_id: `api:${ctx.integrationId}:${id}`,
    name,
    niche: ctx.niche,
    address: str(o, "address", "endereco", "logradouro", "formatted_address"),
    city: str(o, "city", "cidade", "municipio") ?? ctx.city ?? null,
    state: (str(o, "state", "uf", "estado") ?? ctx.uf).toUpperCase().slice(0, 2),
    lat: num(str(o, "lat", "latitude")),
    lng: num(str(o, "lng", "lon", "longitude")),
    phone: str(o, "phone", "telefone", "fone", "celular", "whatsapp"),
    email: str(o, "email", "e-mail"),
    website: str(o, "website", "site", "url"),
    instagram: str(o, "instagram"),
    facebook: str(o, "facebook"),
    cnpj: str(o, "cnpj")?.replace(/\D/g, "") || null,
    verified_at: new Date().toISOString(),
  };
}
