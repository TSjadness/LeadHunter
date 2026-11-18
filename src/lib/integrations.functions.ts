// Custom API integrations. All reads/writes go through the server so that the secret
// header value is encrypted before storage and never sent back to the browser.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { AppError, dbErrorMessage, runSafely } from "./errors";
import { checkOutboundUrl } from "./net-guard";
import { integrationInputSchema, searchInputSchema } from "./schemas";

/** Shape returned to the browser — no secret material, only whether one exists. */
export type IntegrationView = {
  id: string;
  name: string;
  url: string;
  method: "GET" | "POST";
  header_name: string | null;
  results_path: string | null;
  enabled: boolean;
  use_in_search: boolean;
  has_secret: boolean;
  created_at: string;
};

const PUBLIC_COLUMNS =
  "id,name,url,method,header_name,results_path,enabled,use_in_search,created_at,secret_ciphertext,header_value";

type Row = {
  id: string;
  name: string;
  url: string;
  method: string;
  header_name: string | null;
  results_path: string | null;
  enabled: boolean;
  use_in_search: boolean;
  created_at: string;
  secret_ciphertext: string | null;
  header_value: string | null;
};

function toView(r: Row): IntegrationView {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    method: r.method === "POST" ? "POST" : "GET",
    header_name: r.header_name,
    results_path: r.results_path,
    enabled: r.enabled,
    use_in_search: r.use_in_search,
    has_secret: !!(r.secret_ciphertext || r.header_value),
    created_at: r.created_at,
  };
}

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(({ context }) =>
    runSafely("listIntegrations", async () => {
      const { data, error } = await context.supabase
        .from("api_integrations")
        .select(PUBLIC_COLUMNS)
        .order("created_at");
      if (error) throw new AppError("INTERNAL", dbErrorMessage(error));
      const { hasEncryptionKey } = await import("./server/crypto.server");
      return { items: (data as Row[]).map(toView), canStoreSecrets: hasEncryptionKey() };
    }),
  );

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => integrationInputSchema.parse(d))
  .handler(({ data, context }) =>
    runSafely("saveIntegration", async () => {
      const { serverConfig } = await import("./server/env.server");
      const { encryptSecret, hasEncryptionKey } = await import("./server/crypto.server");
      const { enforceRateLimit } = await import("./server/rate-limit.server");
      await enforceRateLimit(
        context.supabase,
        context.userId,
        "writes",
        serverConfig.rateLimit.writesPerMinute,
      );

      const probe = data.url.replace(/\{(niche|uf|city|limit)\}/g, "x");
      const check = checkOutboundUrl(probe, { allowHttp: serverConfig.integrations.allowHttp });
      if (!check.ok) throw new AppError("VALIDATION", `Link da API: ${check.reason}.`);

      const patch: Record<string, unknown> = {
        name: data.name,
        url: data.url,
        method: data.method,
        header_name: data.header_name,
        results_path: data.results_path,
        ...(data.enabled != null ? { enabled: data.enabled } : {}),
        ...(data.use_in_search != null ? { use_in_search: data.use_in_search } : {}),
      };
      if (data.header_value !== undefined) {
        if (data.header_value === "") {
          patch["secret_ciphertext"] = null;
          patch["header_value"] = null;
        } else {
          if (!hasEncryptionKey()) {
            throw new AppError(
              "CONFIG",
              "O servidor não tem INTEGRATIONS_ENCRYPTION_KEY configurada, então não pode guardar chaves de API com segurança. Veja SUPABASE_SETUP.md.",
            );
          }
          patch["secret_ciphertext"] = await encryptSecret(data.header_value);
          patch["header_value"] = null; // never store plaintext
        }
      }
      if (!data.header_name) {
        patch["secret_ciphertext"] = null;
        patch["header_value"] = null;
      }

      const sb = context.supabase;
      if (data.id) {
        const { data: row, error } = await sb
          .from("api_integrations")
          .update(patch as never)
          .eq("id", data.id)
          .select(PUBLIC_COLUMNS)
          .maybeSingle();
        if (error) throw new AppError("INTERNAL", dbErrorMessage(error));
        if (!row) throw new AppError("NOT_FOUND", "Integração não encontrada.");
        return toView(row as Row);
      }
      const { count } = await sb
        .from("api_integrations")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) >= serverConfig.integrations.maxPerUser) {
        throw new AppError(
          "VALIDATION",
          `Limite de ${serverConfig.integrations.maxPerUser} integrações por conta atingido.`,
        );
      }
      const { data: row, error } = await sb
        .from("api_integrations")
        .insert(patch as { name: string; url: string })
        .select(PUBLIC_COLUMNS)
        .single();
      if (error) throw new AppError("INTERNAL", dbErrorMessage(error));
      return toView(row as Row);
    }),
  );

export const setIntegrationFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean().optional(),
        use_in_search: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(({ data, context }) =>
    runSafely("setIntegrationFlags", async () => {
      const patch = {
        ...(data.enabled != null ? { enabled: data.enabled } : {}),
        ...(data.use_in_search != null ? { use_in_search: data.use_in_search } : {}),
      };
      const { error } = await context.supabase
        .from("api_integrations")
        .update(patch)
        .eq("id", data.id);
      if (error) throw new AppError("INTERNAL", dbErrorMessage(error));
      return { ok: true };
    }),
  );

export const deleteIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(({ data, context }) =>
    runSafely("deleteIntegration", async () => {
      const { error } = await context.supabase.from("api_integrations").delete().eq("id", data.id);
      if (error) throw new AppError("INTERNAL", dbErrorMessage(error));
      return { ok: true };
    }),
  );

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    searchInputSchema.omit({ limit: true }).extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(({ data, context }) =>
    runSafely("testIntegration", async () => {
      const { serverConfig } = await import("./server/env.server");
      const { enforceRateLimit } = await import("./server/rate-limit.server");
      const { callIntegration, INTEGRATION_SERVER_COLUMNS } =
        await import("./server/providers/custom.server");
      await enforceRateLimit(
        context.supabase,
        context.userId,
        "integration_test",
        serverConfig.rateLimit.integrationTestPerMinute,
      );
      const { data: it, error } = await context.supabase
        .from("api_integrations")
        .select(INTEGRATION_SERVER_COLUMNS)
        .eq("id", data.id)
        .maybeSingle();
      if (error || !it) return { ok: false as const, error: "Integração não encontrada." };
      try {
        const r = await callIntegration(context.supabase, it, {
          niche: data.niche,
          uf: data.uf,
          city: data.city,
          limit: 10,
        });
        return {
          ok: true as const,
          count: r.items.length,
          preview: r.items.slice(0, 5).map((l) => l.name),
          sample: r.sample,
        };
      } catch (e) {
        return {
          ok: false as const,
          error:
            e instanceof Error && e.name === "OutboundError" ? e.message : "Falha ao chamar a API.",
        };
      }
    }),
  );
