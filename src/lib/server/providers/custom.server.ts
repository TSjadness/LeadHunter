// User-defined HTTP integrations. URLs are user input, so every call goes through
// guardedFetch (SSRF checks, redirect re-validation, size/time caps). Secrets are stored
// encrypted and decrypted only here, on the server.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { extractItems, fillTemplate, mapRecord, type SearchVars } from "../../custom-api";
import type { DiscoveredLead } from "../../osm";
import { decryptSecret, encryptSecret, hasEncryptionKey } from "../crypto.server";
import { guardedFetch, OutboundError } from "../safe-fetch.server";

export type IntegrationRow = {
  id: string;
  name: string;
  url: string;
  method: string;
  header_name: string | null;
  header_value: string | null;
  secret_ciphertext: string | null;
  results_path: string | null;
};

export const INTEGRATION_SERVER_COLUMNS =
  "id,name,url,method,header_name,header_value,secret_ciphertext,results_path" as const;

/** Resolves the auth header value; migrates legacy plaintext to ciphertext when possible. */
async function resolveSecret(
  supabase: SupabaseClient<Database>,
  it: IntegrationRow,
): Promise<string | null> {
  if (it.secret_ciphertext) {
    try {
      return await decryptSecret(it.secret_ciphertext);
    } catch {
      throw new OutboundError(
        "não foi possível ler a chave salva (chave de criptografia do servidor mudou?)",
      );
    }
  }
  if (it.header_value) {
    if (hasEncryptionKey()) {
      const ct = await encryptSecret(it.header_value);
      await supabase
        .from("api_integrations")
        .update({ secret_ciphertext: ct, header_value: null })
        .eq("id", it.id);
    }
    return it.header_value;
  }
  return null;
}

function redact(text: string, secret: string | null) {
  return secret && secret.length >= 4 ? text.split(secret).join("••••") : text;
}

export async function callIntegration(
  supabase: SupabaseClient<Database>,
  it: IntegrationRow,
  vars: SearchVars,
  signal?: AbortSignal,
): Promise<{ items: DiscoveredLead[]; sample: string; status: number }> {
  const secret = await resolveSecret(supabase, it);
  const headers: Record<string, string> = { accept: "application/json" };
  if (it.header_name && secret) headers[it.header_name] = secret;
  const method = it.method === "POST" ? "POST" : "GET";
  let body: string | undefined;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(vars);
  }
  const res = await guardedFetch(fillTemplate(it.url, vars), {
    method,
    headers,
    ...(body ? { body } : {}),
    ...(signal ? { signal } : {}),
  });
  const sample = redact(res.text.slice(0, 1500), secret);
  if (!res.ok) throw new OutboundError(`a API respondeu HTTP ${res.status}`, res.status);
  let json: unknown;
  try {
    json = JSON.parse(res.text);
  } catch {
    throw new OutboundError("a resposta não é JSON");
  }
  const items = extractItems(json, it.results_path)
    .map((o, i) => mapRecord(o, { ...vars, integrationId: it.id, index: i, providerName: it.name }))
    .filter((x): x is DiscoveredLead => !!x);
  return { items, sample, status: res.status };
}
