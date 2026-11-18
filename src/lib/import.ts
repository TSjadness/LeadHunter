// Pure import helpers (testable): column mapping + per-row validation with the shared schema.
import { parsePriority, parseStatus } from "./constants";
import { leadFieldsSchema, type LeadFields } from "./schemas";

export const IMPORT_FIELDS = [
  "name",
  "legal_name",
  "trade_name",
  "cnpj",
  "cnae",
  "niche",
  "address",
  "city",
  "state",
  "phone",
  "whatsapp",
  "email",
  "website",
  "instagram",
  "facebook",
  "linkedin",
  "notes",
  "status",
  "priority",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  name: "Nome",
  legal_name: "Razão social",
  trade_name: "Nome fantasia",
  cnpj: "CNPJ",
  cnae: "CNAE",
  niche: "Segmento",
  address: "Endereço",
  city: "Cidade",
  state: "UF",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  website: "Site",
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  notes: "Notas",
  status: "Status",
  priority: "Prioridade",
};

const ALIASES: Record<string, ImportField> = {
  nome: "name",
  empresa: "name",
  razao_social: "legal_name",
  fantasia: "trade_name",
  nome_fantasia: "trade_name",
  telefone: "phone",
  fone: "phone",
  celular: "phone",
  wpp: "whatsapp",
  zap: "whatsapp",
  cidade: "city",
  municipio: "city",
  uf: "state",
  estado: "state",
  endereco: "address",
  site: "website",
  nicho: "niche",
  segmento: "niche",
  observacoes: "notes",
  notas: "notes",
  prioridade: "priority",
  "e-mail": "email",
  e_mail: "email",
};

export const MAX_IMPORT_ROWS = 10000;

export function guessMapping(headers: string[]): Record<string, ImportField | ""> {
  const m: Record<string, ImportField | ""> = {};
  const used = new Set<string>();
  for (const h of headers) {
    const k = h
      .replace(/^\uFEFF/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_");
    const f = (IMPORT_FIELDS as readonly string[]).includes(k)
      ? (k as ImportField)
      : (ALIASES[k] ?? "");
    // Two columns mapped to the same field would silently overwrite each other.
    m[h] = f && !used.has(f) ? f : "";
    if (f) used.add(f);
  }
  return m;
}

export type RowResult = { ok: true; value: LeadFields } | { ok: false; error: string };

const ERR_LABELS: Record<string, string> = {
  name: "sem nome",
  cnpj: "CNPJ inválido",
  state: "UF inválida",
  status: "status inválido",
  priority: "prioridade inválida",
};

export function mapRow(
  row: Record<string, unknown>,
  mapping: Record<string, ImportField | "">,
): RowResult {
  const out: Record<string, unknown> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (!field) continue;
    const v = row[col];
    if (v != null && String(v).trim() !== "") out[field] = String(v).trim();
  }
  if (!out["name"]) return { ok: false, error: "sem nome" };
  if (typeof out["status"] === "string") {
    const s = parseStatus(out["status"]);
    if (!s) return { ok: false, error: `status inválido ("${out["status"]}")` };
    out["status"] = s;
  }
  if (typeof out["priority"] === "string") {
    const p = parsePriority(out["priority"]);
    if (!p) return { ok: false, error: `prioridade inválida ("${out["priority"]}")` };
    out["priority"] = p;
  }
  // An e-mail that was provided but cannot be parsed is reported, not silently dropped.
  if (
    typeof out["email"] === "string" &&
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out["email"].replace(/^mailto:/i, ""))
  ) {
    return { ok: false, error: "e-mail inválido" };
  }
  const parsed = leadFieldsSchema.safeParse(out);
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? "");
    return { ok: false, error: ERR_LABELS[field] ?? `${field || "dados"} inválido` };
  }
  // Drop keys that ended up undefined/null so the insert only carries real data.
  const value = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v != null),
  ) as LeadFields;
  return { ok: true, value };
}
