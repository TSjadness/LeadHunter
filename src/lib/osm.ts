// Pure helpers for OpenStreetMap / Overpass / Nominatim. No network here (testable).
import {
  cleanText,
  isValidCnpj,
  normalizeCnpj,
  normalizeEmail,
  normalizeFacebook,
  normalizeInstagram,
  normalizeLinkedin,
  normalizePhone,
  normalizeUrl,
  normalizeWhatsapp,
  validCoord,
} from "./normalize";

/** Maps common Portuguese niche words to OSM tag filters. */
const NICHE_TAGS: Record<string, string[]> = {
  restaurante: ['"amenity"="restaurant"'],
  lanchonete: ['"amenity"="fast_food"'],
  hamburgueria: [
    '"amenity"="fast_food"]["cuisine"~"burger",i',
    '"amenity"="restaurant"]["cuisine"~"burger",i',
  ],
  pizzaria: [
    '"amenity"="restaurant"]["cuisine"~"pizza",i',
    '"amenity"="fast_food"]["cuisine"~"pizza",i',
  ],
  sorveteria: ['"amenity"="ice_cream"', '"shop"="ice_cream"'],
  bar: ['"amenity"="bar"', '"amenity"="pub"'],
  cafe: ['"amenity"="cafe"'],
  cafeteria: ['"amenity"="cafe"'],
  padaria: ['"shop"="bakery"'],
  confeitaria: ['"shop"="confectionery"', '"shop"="pastry"'],
  acougue: ['"shop"="butcher"'],
  farmacia: ['"amenity"="pharmacy"'],
  drogaria: ['"amenity"="pharmacy"'],
  academia: ['"leisure"="fitness_centre"'],
  dentista: ['"amenity"="dentist"', '"healthcare"="dentist"'],
  clinica: ['"amenity"="clinic"', '"healthcare"="clinic"', '"amenity"="doctors"'],
  medico: ['"amenity"="doctors"', '"healthcare"="doctor"'],
  hospital: ['"amenity"="hospital"'],
  laboratorio: ['"healthcare"="laboratory"'],
  fisioterapia: ['"healthcare"="physiotherapist"'],
  veterinario: ['"amenity"="veterinary"'],
  petshop: ['"shop"="pet"'],
  "pet shop": ['"shop"="pet"'],
  pet: ['"shop"="pet"'],
  mercado: ['"shop"="supermarket"', '"shop"="convenience"'],
  supermercado: ['"shop"="supermarket"'],
  hortifruti: ['"shop"="greengrocer"'],
  salao: ['"shop"="hairdresser"', '"shop"="beauty"'],
  estetica: ['"shop"="beauty"'],
  barbearia: ['"shop"="hairdresser"'],
  hotel: ['"tourism"="hotel"', '"tourism"="guest_house"'],
  pousada: ['"tourism"="guest_house"', '"tourism"="hostel"'],
  oficina: ['"shop"="car_repair"'],
  "auto pecas": ['"shop"="car_parts"'],
  "lava jato": ['"amenity"="car_wash"'],
  concessionaria: ['"shop"="car"'],
  advogado: ['"office"="lawyer"'],
  advocacia: ['"office"="lawyer"'],
  contabilidade: ['"office"="accountant"'],
  contador: ['"office"="accountant"'],
  imobiliaria: ['"office"="estate_agent"'],
  escola: ['"amenity"="school"'],
  "curso de idiomas": ['"amenity"="language_school"'],
  autoescola: ['"amenity"="driving_school"'],
  posto: ['"amenity"="fuel"'],
  otica: ['"shop"="optician"'],
  roupas: ['"shop"="clothes"'],
  calcados: ['"shop"="shoes"'],
  joalheria: ['"shop"="jewelry"'],
  floricultura: ['"shop"="florist"'],
  papelaria: ['"shop"="stationery"'],
  livraria: ['"shop"="books"'],
  lavanderia: ['"shop"="laundry"', '"shop"="dry_cleaning"'],
  "material de construcao": ['"shop"="hardware"', '"shop"="doityourself"'],
  ferragens: ['"shop"="hardware"'],
  moveis: ['"shop"="furniture"'],
  eletronicos: ['"shop"="electronics"'],
  celular: ['"shop"="mobile_phone"'],
  informatica: ['"shop"="computer"'],
  grafica: ['"shop"="copyshop"', '"craft"="printer"'],
  loja: ['"shop"'],
};

export function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nicheFilters(niche: string): string[] {
  const n = normalize(niche);
  // Exact match first, then longest prefix ("barbearia" must not match "bar").
  const exact =
    NICHE_TAGS[n] ?? NICHE_TAGS[n.replace(/s$/, "")] ?? NICHE_TAGS[n.replace(/es$/, "")];
  if (exact) return exact;
  const key = Object.keys(NICHE_TAGS)
    .sort((a, b) => b.length - a.length)
    .find((k) => n.startsWith(k + " ") || (k.length >= 4 && n.startsWith(k)));
  return key ? NICHE_TAGS[key]! : [];
}

export const KNOWN_NICHES = Object.keys(NICHE_TAGS);

/** Nominatim queries for a niche + place: OSM category phrase first, then plain words. */
export function nominatimQueries(niche: string, place: string): string[] {
  const out: string[] = [];
  const tag = nicheFilters(niche)[0];
  const value = tag && /^"[^"]+"="([a-z_]+)"$/.exec(tag)?.[1];
  if (value) out.push(`${value.replace(/_/g, " ")} in ${place}`);
  out.push(`${niche.trim()} ${place}`);
  return out;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
}

export type BBox = [number, number, number, number]; // south, west, north, east

export function buildOverpassQuery(opts: {
  niche: string;
  uf: string;
  city?: string | undefined;
  limit: number;
  bbox?: BBox | undefined;
  timeoutSec?: number;
}) {
  const { niche, uf, limit, bbox } = opts;
  const city = bbox ? undefined : opts.city;
  const areaState = `area["ISO3166-2"="BR-${uf.toUpperCase()}"]->.uf;`;
  const areaCity = city
    ? `area["name"="${city.replace(/["\\]/g, "")}"]["boundary"="administrative"](area.uf)->.a;`
    : "";
  const area = bbox ? bbox.join(",") : city ? "area.a" : "area.uf";
  const tags = nicheFilters(niche);
  const nameRe = escapeRegex(niche.trim());
  // Only named places are usable leads; filter in the query so small limits aren't consumed by unnamed POIs.
  const parts = tags.length
    ? tags.map((t) => `nwr[${t}]["name"](${area});`)
    : [
        `nwr["name"~"${nameRe}",i]["shop"](${area});`,
        `nwr["name"~"${nameRe}",i]["amenity"](${area});`,
        `nwr["name"~"${nameRe}",i]["office"](${area});`,
        `nwr["name"~"${nameRe}",i]["craft"](${area});`,
      ];
  // Over-fetch a little so dedupe/filters still leave `limit` results.
  const out = Math.max(10, Math.min(limit * 2, 500));
  const timeout = Math.max(10, Math.min(opts.timeoutSec ?? 80, 180));
  return `[out:json][timeout:${timeout}];${bbox ? "" : areaState + areaCity}(${parts.join("")});out center tags ${out};`;
}

export type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type DiscoveredLead = {
  source: string;
  source_id: string;
  name: string;
  niche: string;
  address: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  whatsapp: string | null;
  cnpj: string | null;
  verified_at: string;
  /** Human-readable provider name, for the "Fonte" line in the UI. */
  provider: string;
};

const pickTag = (t: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (t[k]) return t[k];
  return null;
};

function validCnpjOrNull(v: string | null) {
  const c = normalizeCnpj(v);
  return c && isValidCnpj(c) ? c : null;
}

export function parseElement(
  el: OsmElement,
  ctx: { niche: string; uf: string; city?: string | undefined },
): DiscoveredLead | null {
  const t = el.tags ?? {};
  const name = cleanText(t["name"] || t["brand"], 300);
  if (!name) return null;
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
  const address = cleanText(
    [street, t["addr:suburb"], t["addr:postcode"]].filter(Boolean).join(" - "),
  );
  const pos = validCoord(el.lat ?? el.center?.lat, el.lon ?? el.center?.lon);
  return {
    source: "osm",
    source_id: `${el.type}/${el.id}`,
    name,
    niche: ctx.niche,
    address,
    city: cleanText(t["addr:city"], 120) ?? ctx.city ?? null,
    state: ctx.uf.toUpperCase(),
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    phone: normalizePhone(pickTag(t, "phone", "contact:phone", "mobile", "contact:mobile")),
    email: normalizeEmail(pickTag(t, "email", "contact:email")),
    website: normalizeUrl(pickTag(t, "website", "contact:website", "url")),
    instagram: normalizeInstagram(pickTag(t, "contact:instagram", "instagram")),
    facebook: normalizeFacebook(pickTag(t, "contact:facebook", "facebook")),
    linkedin: normalizeLinkedin(pickTag(t, "contact:linkedin", "linkedin")),
    whatsapp: normalizeWhatsapp(pickTag(t, "contact:whatsapp", "whatsapp")),
    cnpj: validCnpjOrNull(pickTag(t, "ref:vatin", "ref:CNPJ", "ref:cnpj")),
    verified_at: new Date().toISOString(),
    provider: "OpenStreetMap (Overpass)",
  };
}

/** Same-id de-duplication (kept for compatibility; see dedupe.ts for cross-provider matching). */
export function dedupe<T extends { source_id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.source_id) ? false : (seen.add(i.source_id), true)));
}

export type NominatimPlace = {
  osm_type?: string;
  osm_id?: number;
  name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
  boundingbox?: string[];
};

/** Maps a Nominatim search hit to a lead (same source_id format as Overpass, so dedupe works). */
export function parseNominatim(
  p: NominatimPlace,
  ctx: { niche: string; uf: string; city?: string | undefined },
): DiscoveredLead | null {
  const name = cleanText(p.name, 300);
  if (!name || !p.osm_type || p.osm_id == null) return null;
  const a = p.address ?? {};
  const t = p.extratags ?? {};
  const street = [a["road"], a["house_number"]].filter(Boolean).join(", ");
  const address = cleanText([street, a["suburb"], a["postcode"]].filter(Boolean).join(" - "));
  const pos = validCoord(p.lat, p.lon);
  const uf =
    a["ISO3166-2-lvl4"]?.replace(/^BR-/, "") ?? (ctx.uf === "BR" ? null : ctx.uf.toUpperCase());
  return {
    source: "osm",
    source_id: `${p.osm_type}/${p.osm_id}`,
    name,
    niche: ctx.niche,
    address,
    city:
      cleanText(a["city"] ?? a["town"] ?? a["village"] ?? a["municipality"], 120) ??
      ctx.city ??
      null,
    state: uf,
    lat: pos?.lat ?? null,
    lng: pos?.lng ?? null,
    phone: normalizePhone(t["phone"] ?? t["contact:phone"] ?? t["mobile"]),
    email: normalizeEmail(t["email"] ?? t["contact:email"]),
    website: normalizeUrl(t["website"] ?? t["contact:website"]),
    instagram: normalizeInstagram(t["contact:instagram"]),
    facebook: normalizeFacebook(t["contact:facebook"]),
    linkedin: normalizeLinkedin(t["contact:linkedin"]),
    whatsapp: normalizeWhatsapp(t["contact:whatsapp"]),
    cnpj: validCnpjOrNull(t["ref:vatin"] ?? null),
    verified_at: new Date().toISOString(),
    provider: "OpenStreetMap (Nominatim)",
  };
}

/** Keeps only places inside the requested state when Nominatim tells us the state. */
export function nominatimInState(p: NominatimPlace, uf: string, stateName: string) {
  if (uf === "BR") return true;
  const iso = p.address?.["ISO3166-2-lvl4"];
  if (iso) return iso === `BR-${uf.toUpperCase()}`;
  return !p.address?.["state"] || p.address["state"] === stateName;
}
