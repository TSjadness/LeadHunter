// Pure duplicate detection. Two records are the same business only with strong evidence:
// same provider id, same CNPJ, or same name *and* the same place. Branches of a chain
// (same name, different location) are kept as different leads.
import { distanceMeters, foldKey, normalizeCnpj, phoneDigits, validCoord } from "./normalize";

export type Matchable = {
  source?: string | null | undefined;
  source_id?: string | null | undefined;
  cnpj?: string | null | undefined;
  name: string;
  city?: string | null | undefined;
  address?: string | null | undefined;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
  phone?: string | null | undefined;
};

export type MatchReason = "source" | "cnpj" | "name_location" | "phone_location";

/** Same name within this distance (m) is treated as the same place. */
export const SAME_PLACE_METERS = 120;

export function sameBusiness(a: Matchable, b: Matchable): MatchReason | null {
  if (
    a.source_id &&
    b.source_id &&
    (a.source ?? "manual") === (b.source ?? "manual") &&
    a.source_id === b.source_id
  ) {
    return "source";
  }
  const ca = normalizeCnpj(a.cnpj);
  const cb = normalizeCnpj(b.cnpj);
  if (ca && cb) return ca === cb ? "cnpj" : null; // different CNPJ = definitely different
  const pa = validCoord(a.lat, a.lng);
  const pb = validCoord(b.lat, b.lng);
  const near = pa && pb ? distanceMeters(pa, pb) <= SAME_PLACE_METERS : null;
  const sameName = foldKey(a.name) === foldKey(b.name) && foldKey(a.name) !== "";
  if (sameName) {
    if (near !== null) return near ? "name_location" : null;
    const sameCity = foldKey(a.city ?? "") === foldKey(b.city ?? "");
    if (!sameCity) return null;
    const aa = foldKey(a.address ?? "");
    const ab = foldKey(b.address ?? "");
    // Without coordinates, only the same (or unknown) address counts as the same place.
    if (!aa || !ab || aa === ab) return "name_location";
    return null;
  }
  const da = phoneDigits(a.phone);
  if (da.length >= 10 && da === phoneDigits(b.phone) && near) return "phone_location";
  return null;
}

/** Returns the first existing record matching `item`, with the reason. */
export function findDuplicate<T extends Matchable>(
  item: Matchable,
  existing: T[],
): { match: T; reason: MatchReason } | null {
  for (const e of existing) {
    const reason = sameBusiness(item, e);
    if (reason) return { match: e, reason };
  }
  return null;
}

/**
 * De-duplicates search results from several providers. The first occurrence wins and
 * missing fields are filled from later duplicates (data is merged, never invented).
 */
export function mergeDuplicates<T extends Matchable & Record<string, unknown>>(items: T[]): T[] {
  const out: T[] = [];
  for (const it of items) {
    const dup = findDuplicate(it, out);
    if (!dup) {
      out.push({ ...it });
      continue;
    }
    const target = dup.match as Record<string, unknown>;
    for (const [k, v] of Object.entries(it)) {
      if ((target[k] == null || target[k] === "") && v != null && v !== "") target[k] = v;
    }
  }
  return out;
}
