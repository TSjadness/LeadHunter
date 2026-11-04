// Pure helpers for OpenStreetMap / Overpass. No network here (testable).

/** Maps common Portuguese niche words to OSM tag filters. */
const NICHE_TAGS: Record<string, string[]> = {
  restaurante: ['"amenity"="restaurant"'],
  lanchonete: ['"amenity"="fast_food"'],
  pizzaria: ['"amenity"="restaurant"]["cuisine"~"pizza",i'],
  bar: ['"amenity"="bar"', '"amenity"="pub"'],
  cafe: ['"amenity"="cafe"'],
  padaria: ['"shop"="bakery"'],
  farmacia: ['"amenity"="pharmacy"'],
  academia: ['"leisure"="fitness_centre"'],
  dentista: ['"amenity"="dentist"', '"healthcare"="dentist"'],
  clinica: ['"amenity"="clinic"', '"healthcare"="clinic"'],
  hospital: ['"amenity"="hospital"'],
  veterinario: ['"amenity"="veterinary"'],
  petshop: ['"shop"="pet"'],
  mercado: ['"shop"="supermarket"', '"shop"="convenience"'],
  supermercado: ['"shop"="supermarket"'],
  salao: ['"shop"="hairdresser"', '"shop"="beauty"'],
  barbearia: ['"shop"="hairdresser"'],
  hotel: ['"tourism"="hotel"', '"tourism"="guest_house"'],
  oficina: ['"shop"="car_repair"'],
  advogado: ['"office"="lawyer"'],
  contabilidade: ['"office"="accountant"'],
  imobiliaria: ['"office"="estate_agent"'],
  escola: ['"amenity"="school"'],
  posto: ['"amenity"="fuel"'],
  otica: ['"shop"="optician"'],
  roupas: ['"shop"="clothes"'],
  loja: ['"shop"'],
};

export function normalize(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function nicheFilters(niche: string): string[] {
  const n = normalize(niche);
  for (const [k, v] of Object.entries(NICHE_TAGS)) {
    if (n === k || n.startsWith(k) || n.replace(/s$/, "") === k) return v;
  }
  return [];
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");
}

export type BBox = [number, number, number, number]; // south, west, north, east

export function buildOverpassQuery(opts: { niche: string; uf: string; city?: string | undefined; limit: number; bbox?: BBox | undefined }) {
  const { niche, uf, limit, bbox } = opts;
  const city = bbox ? undefined : opts.city;
  const areaState = `area["ISO3166-2"="BR-${uf.toUpperCase()}"]->.uf;`;
  const areaCity = city
    ? `area["name"="${city.replace(/"/g, "")}"]["boundary"="administrative"](area.uf)->.a;`
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
  return `[out:json][timeout:55];${bbox ? "" : areaState + areaCity}(${parts.join("")});out center tags ${out};`;
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
  cnpj: string | null;
  verified_at: string;
};

export function parseElement(el: OsmElement, ctx: { niche: string; uf: string; city?: string | undefined }): DiscoveredLead | null {
  const t = el.tags ?? {};
  const name = t["name"] || t["brand"];
  if (!name) return null;
  const pick = (...keys: string[]) => {
    for (const k of keys) if (t[k]) return t[k];
    return null;
  };
  const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
  const address = [street, t["addr:suburb"], t["addr:postcode"]].filter(Boolean).join(" - ") || null;
  return {
    source: "osm",
    source_id: `${el.type}/${el.id}`,
    name,
    niche: ctx.niche,
    address,
    city: t["addr:city"] ?? ctx.city ?? null,
    state: ctx.uf.toUpperCase(),
    lat: el.lat ?? el.center?.lat ?? null,
    lng: el.lon ?? el.center?.lon ?? null,
    phone: pick("phone", "contact:phone", "mobile", "contact:mobile", "contact:whatsapp"),
    email: pick("email", "contact:email"),
    website: pick("website", "contact:website", "url"),
    instagram: pick("contact:instagram", "instagram"),
    facebook: pick("contact:facebook", "facebook"),
    cnpj: pick("ref:vatin", "ref:CNPJ", "ref:cnpj")?.replace(/\D/g, "") || null,
    verified_at: new Date().toISOString(),
  };
}

export function dedupe<T extends { source_id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.source_id) ? false : (seen.add(i.source_id), true)));
}
