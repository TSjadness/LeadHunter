// Pure normalisation/validation of contact data. These functions only re-format what
// the source provided; they never invent values (missing/invalid input becomes null).

export function cleanText(v: unknown, max = 500): string | null {
  if (v == null) return null;
  const s = String(v)
    // eslint-disable-next-line no-control-regex -- strip control characters from external data
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s ? s.slice(0, max) : null;
}

/** Accent/case-insensitive key, used for matching only (never stored as display text). */
export function foldKey(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Same expression as the generated column leads.name_key in Postgres. */
export function dbNameKey(name: string) {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

// --------------------------------------------------------------------------- CNPJ
const CNPJ_RE = /^[0-9A-Z]{12}[0-9]{2}$/;

/** Strips punctuation and upper-cases; supports the alphanumeric CNPJ format (2026+). */
export function normalizeCnpj(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v)
    .toUpperCase()
    .replace(/[.\-/\s]/g, "");
  // OSM ref:vatin values are often "BR" + CNPJ.
  return s ? (s.length === 16 && s.startsWith("BR") ? s.slice(2) : s) : null;
}

/** Validates check digits (numeric and alphanumeric CNPJ: char value = ASCII − 48). */
export function isValidCnpj(raw: string | null | undefined): boolean {
  const c = normalizeCnpj(raw);
  if (!c || !CNPJ_RE.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const val = (ch: string) => ch.charCodeAt(0) - 48;
  const dv = (base: string) => {
    const weights =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...base].reduce((acc, ch, i) => acc + val(ch) * weights[i]!, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(c.slice(0, 12));
  const d2 = dv(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export function formatCnpj(c: string | null | undefined) {
  const n = normalizeCnpj(c);
  if (!n || n.length !== 14) return c ?? "";
  return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
}

// --------------------------------------------------------------------------- phone
/**
 * Formats Brazilian phone numbers as "+55 DD NNNNN-NNNN". Multiple numbers separated by
 * ";" or "/" keep only the first. Numbers that do not look Brazilian are kept as given.
 */
export function normalizePhone(v: unknown): string | null {
  const raw = cleanText(v, 60);
  if (!raw) return null;
  const first = raw.split(/[;/,]| ou /i)[0]!.trim();
  let d = first.replace(/\D/g, "");
  // Toll-free / non-geographic numbers (0800, 0300, 0500, 0900) have no DDD.
  if (/^0[3589]00/.test(d)) return first;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1); // 0 + DDD + 8 digits
  if (d.length === 10 || d.length === 11) {
    const ddd = d.slice(0, 2);
    const num = d.slice(2);
    return `+55 ${ddd} ${num.slice(0, num.length - 4)}-${num.slice(-4)}`;
  }
  // 0800/0300 and short numbers: keep what the source said, just tidied.
  return first.length >= 4 ? first : null;
}

export function phoneDigits(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
}

// --------------------------------------------------------------------------- web
/** Returns an http(s) URL or null. Blocks javascript:, data:, etc. */
export function normalizeUrl(v: unknown): string | null {
  const raw = cleanText(v, 500);
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw)
    ? raw
    : /^[\w-]+(\.[\w-]+)+/.test(raw)
      ? `https://${raw}`
      : null;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Safe value for href attributes on data from external sources. */
export function safeHref(v: string | null | undefined): string | undefined {
  return normalizeUrl(v) ?? undefined;
}

export function normalizeEmail(v: unknown): string | null {
  const raw = cleanText(v, 320);
  if (!raw) return null;
  const e = raw
    .replace(/^mailto:/i, "")
    .split(/[;,\s]/)[0]!
    .toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e) ? e : null;
}

function socialUrl(v: unknown, hosts: string[], base: string): string | null {
  const raw = cleanText(v, 300);
  if (!raw) return null;
  const handle = raw.replace(/^@/, "");
  if (/^[\w.]{1,60}$/.test(handle) && !handle.includes("..")) return `${base}${handle}`;
  const url = normalizeUrl(raw);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^www\.|^m\./, "");
  return hosts.some((h) => host === h || host.endsWith(`.${h}`)) ? url : null;
}

export const normalizeInstagram = (v: unknown) =>
  socialUrl(v, ["instagram.com"], "https://www.instagram.com/");
export const normalizeFacebook = (v: unknown) =>
  socialUrl(v, ["facebook.com", "fb.com"], "https://www.facebook.com/");
export const normalizeLinkedin = (v: unknown) => {
  const raw = cleanText(v, 300);
  if (!raw) return null;
  const url = normalizeUrl(raw);
  return url && /(^|\.)linkedin\.com$/.test(new URL(url).hostname) ? url : null;
};

/** WhatsApp from a phone-like value or wa.me / api.whatsapp.com link. */
export function normalizeWhatsapp(v: unknown): string | null {
  const raw = cleanText(v, 300);
  if (!raw) return null;
  const m = raw.match(/(?:wa\.me\/|phone=)(\+?\d{10,15})/);
  return normalizePhone(m ? m[1] : raw);
}

export function whatsappLink(v: string | null | undefined) {
  const d = phoneDigits(v);
  return d.length === 10 || d.length === 11 ? `https://wa.me/55${d}` : undefined;
}

export function normalizeUf(v: unknown): string | null {
  const s = cleanText(v, 40)?.toUpperCase();
  return s && /^[A-Z]{2}$/.test(s) ? s : null;
}

// --------------------------------------------------------------------------- geo
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function validCoord(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = typeof lat === "string" ? Number(lat) : lat;
  const b = typeof lng === "string" ? Number(lng) : lng;
  if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b))
    return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return { lat: a, lng: b };
}
