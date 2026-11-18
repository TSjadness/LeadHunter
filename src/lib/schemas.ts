// Shared Zod schemas: the same rules validate input in the browser (forms, imports)
// and again on the server (server functions), so nothing relies on client checks alone.
import { z } from "zod";
import { LEAD_STATUSES, INTERACTION_KINDS, UFS, parsePriority } from "./constants";
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
} from "./normalize";

const STATUS_IDS = LEAD_STATUSES.map((s) => s.id) as [string, ...string[]];
const UF_IDS = UFS.map(([s]) => s) as unknown as [string, ...string[]];

export const statusSchema = z.enum(
  STATUS_IDS as [(typeof LEAD_STATUSES)[number]["id"], ...(typeof LEAD_STATUSES)[number]["id"][]],
);
export const ufSchema = z.enum(UF_IDS);

/** Optional text: undefined stays undefined (patch semantics), blank becomes null. */
const text = (max: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : cleanText(v, max)),
    z.string().max(max).nullable().optional(),
  );

/** Normalised optional contact field; a value that cannot be normalised becomes null. */
const normalized = (fn: (v: unknown) => string | null) =>
  z.preprocess((v) => (v === undefined ? undefined : fn(v)), z.string().nullable().optional());

const coord = (limit: number) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : v === null || v === "" ? null : Number(v)),
    z.number().min(-limit).max(limit).nullable().optional(),
  );

export const leadFieldsSchema = z.object({
  name: z.preprocess(
    (v) => cleanText(v, 300) ?? "",
    z.string().min(1, "nome obrigatório").max(300),
  ),
  legal_name: text(300),
  trade_name: text(300),
  cnpj: z
    .preprocess(
      (v) => (v === undefined ? undefined : normalizeCnpj(v)),
      z.string().nullable().optional(),
    )
    .refine((c) => c == null || isValidCnpj(c), "CNPJ inválido"),
  cnae: text(300),
  niche: text(120),
  address: text(500),
  city: text(120),
  state: z.preprocess(
    (v) => (v === undefined ? undefined : (cleanText(v, 2)?.toUpperCase() ?? null)),
    ufSchema.nullable().optional(),
  ),
  lat: coord(90),
  lng: coord(180),
  phone: normalized(normalizePhone),
  email: normalized(normalizeEmail),
  website: normalized(normalizeUrl),
  instagram: normalized(normalizeInstagram),
  facebook: normalized(normalizeFacebook),
  linkedin: normalized(normalizeLinkedin),
  whatsapp: normalized(normalizeWhatsapp),
  status: statusSchema.optional(),
  priority: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : (parsePriority(v) ?? v)),
    z
      .union([z.literal(1), z.literal(2), z.literal(3)], {
        message: "prioridade inválida (use Alta, Média ou Baixa)",
      })
      .optional(),
  ),
  revenue: z.preprocess(
    (v) => (v === undefined ? undefined : v === null || v === "" ? null : Number(v)),
    z.number().nonnegative().finite().nullable().optional(),
  ),
  revenue_source: text(300),
  notes: text(10000),
  source: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_:-]+$/i)
    .optional(),
  source_id: text(200),
  verified_at: z.string().datetime({ offset: true }).nullable().optional(),
});

export type LeadFields = z.infer<typeof leadFieldsSchema>;

/** Patch: every field optional, id-like/ownership columns can never be sent. */
export const leadPatchSchema = leadFieldsSchema.partial();

export const saveLeadsInputSchema = z.object({
  items: z.array(leadFieldsSchema).min(1).max(500),
});

export const searchInputSchema = z.object({
  niche: z.string().trim().min(2, "informe o segmento").max(60),
  /** "BR" = whole country (text search only); otherwise a UF. */
  uf: z.union([z.literal("BR"), ufSchema]),
  city: z.preprocess((v) => cleanText(v, 80) ?? undefined, z.string().max(80).optional()),
  limit: z.number().int().min(1).max(200),
});
export type SearchInput = z.infer<typeof searchInputSchema>;

export const interactionSchema = z.object({
  lead_id: z.string().uuid(),
  kind: z.enum(INTERACTION_KINDS as unknown as [string, ...string[]]),
  content: z.string().trim().min(1, "descreva a interação").max(5000),
});

export const collectionSchema = z.object({
  name: z.string().trim().min(1, "informe um nome").max(120),
  description: z.preprocess((v) => cleanText(v, 1000), z.string().max(1000).nullable()).optional(),
});

export const integrationInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "informe um nome").max(80),
  url: z.string().trim().min(10).max(2000),
  method: z.enum(["GET", "POST"]),
  header_name: z.preprocess(
    (v) => cleanText(v, 100) ?? null,
    z
      .string()
      .regex(/^[A-Za-z0-9-]+$/, "nome de cabeçalho inválido")
      .refine(
        (h) =>
          !["host", "content-length", "cookie", "transfer-encoding", "connection"].includes(
            h.toLowerCase(),
          ),
        "cabeçalho não permitido",
      )
      .nullable(),
  ),
  /** undefined = keep the stored secret; "" = remove it; otherwise replace it. */
  header_value: z.string().max(2000).optional(),
  results_path: z.preprocess(
    (v) => cleanText(v, 200) ?? null,
    z
      .string()
      .regex(/^[\w.-]+$/, "use apenas letras, números e pontos (ex.: data.results)")
      .nullable(),
  ),
  enabled: z.boolean().optional(),
  use_in_search: z.boolean().optional(),
});
export type IntegrationInput = z.infer<typeof integrationInputSchema>;

/** First human-readable message of a Zod error (pt-BR field labels). */
export function firstIssue(err: z.ZodError, labels: Record<string, string> = {}) {
  const i = err.issues[0];
  if (!i) return "dados inválidos";
  const field = String(i.path[0] ?? "");
  const label = labels[field] ?? field;
  return label ? `${label}: ${i.message}` : i.message;
}
