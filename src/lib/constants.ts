export const LEAD_STATUSES = [
  { id: "novo", label: "Novo", tone: "slate" },
  { id: "contato", label: "Em contato", tone: "sky" },
  { id: "negociacao", label: "Negociação", tone: "amber" },
  { id: "ganho", label: "Ganho", tone: "emerald" },
  { id: "perdido", label: "Perdido", tone: "rose" },
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number]["id"];

export const statusLabel = (s: string) => LEAD_STATUSES.find((x) => x.id === s)?.label ?? s;

/** Accepts ids or labels (as found in spreadsheets), case/accent-insensitive. */
export function parseStatus(v: string): LeadStatus | null {
  const k = v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  const hit = LEAD_STATUSES.find(
    (s) =>
      s.id === k ||
      s.label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase() === k,
  );
  if (hit) return hit.id;
  const aliases: Record<string, LeadStatus> = {
    new: "novo",
    contacted: "contato",
    contatado: "contato",
    negotiation: "negociacao",
    won: "ganho",
    fechado: "ganho",
    cliente: "ganho",
    lost: "perdido",
  };
  return aliases[k] ?? null;
}

/** Lead priority (stored as 1–3 so "alta first" is a plain ORDER BY priority DESC). */
export const LEAD_PRIORITIES = [
  { id: 3, label: "Alta" },
  { id: 2, label: "Média" },
  { id: 1, label: "Baixa" },
] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number]["id"];
export const DEFAULT_PRIORITY: LeadPriority = 2;
export const priorityLabel = (p: number | null | undefined) =>
  LEAD_PRIORITIES.find((x) => x.id === p)?.label ?? "Média";

/** Accepts 1–3, labels or common aliases (spreadsheets), case/accent-insensitive. */
export function parsePriority(v: unknown): LeadPriority | null {
  if (typeof v === "number") return v === 1 || v === 2 || v === 3 ? v : null;
  if (typeof v !== "string") return null;
  const k = v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const map: Record<string, LeadPriority> = {
    "1": 1,
    baixa: 1,
    low: 1,
    "2": 2,
    media: 2,
    medio: 2,
    normal: 2,
    medium: 2,
    "3": 3,
    alta: 3,
    high: 3,
    urgente: 3,
  };
  return map[k] ?? null;
}

export const INTERACTION_KINDS = ["nota", "ligação", "whatsapp", "e-mail", "reunião"] as const;

export const UFS = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
] as const;

export const ufName = (uf: string) => UFS.find(([s]) => s === uf.toUpperCase())?.[1] ?? uf;

export const PAGE_SIZE = 10;
export const LEADS_PAGE_SIZE = 25;
export const KANBAN_PAGE_SIZE = 20;

export const NOT_VERIFIED = "Não verificado na fonte";

/** Display names for lead origins. */
export const SOURCE_LABELS: Record<string, string> = {
  osm: "OpenStreetMap",
  api: "API personalizada",
  importacao: "Importação",
  manual: "Manual",
};
export const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

/** Suggested segments (all map to OSM tags, so they return the best results). */
export const NICHE_SUGGESTIONS = [
  "restaurante",
  "pizzaria",
  "padaria",
  "academia",
  "dentista",
  "clínica",
  "farmácia",
  "pet shop",
  "barbearia",
  "salão de beleza",
  "oficina",
  "contabilidade",
  "advogado",
  "imobiliária",
  "hotel",
  "ótica",
];
