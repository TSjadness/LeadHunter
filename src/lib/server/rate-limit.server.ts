// Per-user rate limiting backed by Postgres (public.consume_rate_limit), so limits hold
// across all serverless instances. If the function is missing (migration not applied
// yet) we fall back to a best-effort in-memory limiter instead of blocking the app.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AppError } from "../errors";

export type Bucket = "search" | "cnpj" | "integration_test" | "writes";

const memory = new Map<string, number[]>();

function memoryAllow(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const hits = (memory.get(key) ?? []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= max) return false;
  hits.push(now);
  memory.set(key, hits);
  if (memory.size > 5000) memory.clear();
  return true;
}

export async function enforceRateLimit(
  supabase: SupabaseClient<Database>,
  userId: string,
  bucket: Bucket,
  max: number,
  windowSec = 60,
) {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSec,
  });
  let allowed: boolean;
  if (error) {
    console.warn(
      `[rate-limit] consume_rate_limit indisponível (${error.code}); usando limite local.`,
    );
    allowed = memoryAllow(`${userId}:${bucket}`, max, windowSec);
  } else {
    allowed = data === true;
  }
  if (!allowed) {
    throw new AppError(
      "RATE_LIMITED",
      "Muitas solicitações em pouco tempo. Aguarde um minuto e tente novamente.",
    );
  }
}

const localSlots = new Map<string, number>();

/**
 * Global pacing for free providers (e.g. Nominatim: 1 request/second for the whole app).
 * Returns false when the provider queue is too long and the caller should skip it.
 */
export async function waitProviderSlot(
  supabase: SupabaseClient<Database>,
  provider: "nominatim" | "overpass" | "brasilapi",
  intervalMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  let wait: number;
  const { data, error } = await supabase.rpc("acquire_provider_slot", {
    p_provider: provider,
    p_interval_ms: intervalMs,
  });
  if (error || typeof data !== "number") {
    const now = Date.now();
    const next = Math.max(localSlots.get(provider) ?? 0, now);
    if (next - now > 5000) return false;
    localSlots.set(provider, next + intervalMs);
    wait = next - now;
  } else {
    if (data < 0) return false;
    wait = data;
  }
  if (wait > 0) {
    await new Promise<void>((resolve, reject) => {
      const id = setTimeout(resolve, wait);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }
  return true;
}
