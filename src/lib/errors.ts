// Standard error handling. Server code throws AppError with a message that is safe to
// show; anything else is logged on the server and replaced by a generic message, so
// stack traces, SQL or provider internals never reach the browser.

export type AppErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "UPSTREAM"
  | "CONFIG"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const GENERIC_ERROR = "Não foi possível concluir a operação. Tente novamente.";

type PgLikeError = { code?: string; message?: string; details?: string; status?: number };

/** Maps PostgREST/Postgres/Supabase errors to friendly pt-BR messages. */
export function dbErrorMessage(e: PgLikeError): string {
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  if (code === "23505") return "Já existe um registro com esses dados.";
  if (code === "23514") return "Algum campo tem um valor inválido.";
  if (code === "23503") return "Registro relacionado não encontrado.";
  if (code === "42501" || msg.includes("row-level security"))
    return "Você não tem permissão para esta operação.";
  if (code === "PGRST301" || code === "PGRST303" || msg.includes("jwt"))
    return "Sua sessão expirou. Entre novamente.";
  if (code === "PGRST116") return "Registro não encontrado.";
  if (msg.includes("failed to fetch") || msg.includes("network"))
    return "Sem conexão com o servidor. Verifique sua internet.";
  return GENERIC_ERROR;
}

/** Message to display for any caught error (client side). */
export function userMessage(e: unknown, fallback = GENERIC_ERROR): string {
  if (e instanceof AppError) return e.message;
  if (e && typeof e === "object" && "code" in e && typeof (e as PgLikeError).code === "string") {
    return dbErrorMessage(e as PgLikeError);
  }
  if (e instanceof Error) {
    const m = e.message;
    if (/^Unauthorized/i.test(m)) return "Sua sessão expirou. Entre novamente.";
    if (/failed to fetch|networkerror|load failed/i.test(m))
      return "Sem conexão com o servidor. Verifique sua internet.";
    if (e.name === "AbortError") return "Operação cancelada.";
    // Zod validation errors from server functions arrive as a JSON list of issues.
    if (/^\s*[[{]/.test(m)) {
      try {
        const issues = JSON.parse(m) as { message?: string; path?: unknown[] }[];
        const first = Array.isArray(issues) ? issues[0] : undefined;
        if (first?.message)
          return `Dados inválidos${first.path?.length ? ` (${first.path.join(".")})` : ""}: ${first.message}`;
      } catch {
        /* not JSON */
      }
      return "Alguns dados estão inválidos. Revise os campos.";
    }
    // Server functions only ever throw safe, pt-BR messages (see runSafely).
    if (m && m.length < 300 && !/\bat\s.+:\d+:\d+/.test(m)) return m;
  }
  return fallback;
}

/** Throws a mapped error when a Supabase call failed; returns data otherwise. */
export function unwrap<T>(r: { data: T; error: PgLikeError | null }): T {
  if (r.error) throw new AppError("INTERNAL", dbErrorMessage(r.error));
  return r.data;
}

/** Server-side wrapper: logs unexpected errors and rethrows only safe messages. */
export async function runSafely<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError) throw new Error(e.message);
    console.error(`[${label}]`, e);
    throw new Error(GENERIC_ERROR);
  }
}
