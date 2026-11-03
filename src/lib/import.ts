// Pure import helpers (testable).
export const IMPORT_FIELDS = ["name", "legal_name", "trade_name", "cnpj", "cnae", "niche", "address", "city", "state", "phone", "email", "website", "instagram", "facebook", "notes", "status"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const ALIASES: Record<string, ImportField> = {
  nome: "name", empresa: "name", razao_social: "legal_name", fantasia: "trade_name", nome_fantasia: "trade_name",
  telefone: "phone", fone: "phone", celular: "phone", cidade: "city", uf: "state", estado: "state", endereco: "address",
  site: "website", nicho: "niche", observacoes: "notes", notas: "notes",
};

export function guessMapping(headers: string[]): Record<string, ImportField | ""> {
  const m: Record<string, ImportField | ""> = {};
  for (const h of headers) {
    const k = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, "_");
    m[h] = (IMPORT_FIELDS as readonly string[]).includes(k) ? (k as ImportField) : ALIASES[k] ?? "";
  }
  return m;
}

export type RowResult = { ok: true; value: Partial<Record<ImportField, string>> & { name: string } } | { ok: false; error: string };

export function mapRow(row: Record<string, unknown>, mapping: Record<string, ImportField | "">): RowResult {
  const out: Partial<Record<ImportField, string>> = {};
  for (const [col, field] of Object.entries(mapping)) {
    if (!field) continue;
    const v = row[col];
    if (v != null && String(v).trim() !== "") out[field] = String(v).trim();
  }
  if (!out.name) return { ok: false, error: "sem nome" };
  if (out.cnpj) {
    out.cnpj = out.cnpj.replace(/\D/g, "");
    if (out.cnpj.length !== 14) return { ok: false, error: "CNPJ inválido" };
  }
  if (out.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) return { ok: false, error: "e-mail inválido" };
  if (out.state) out.state = out.state.toUpperCase().slice(0, 2);
  return { ok: true, value: { ...out, name: out.name } };
}
