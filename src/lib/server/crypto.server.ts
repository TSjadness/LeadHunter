// AES-256-GCM encryption for integration secrets (API keys / auth headers).
// The key lives only in the server environment (INTEGRATIONS_ENCRYPTION_KEY); the database
// stores ciphertext and the browser never receives the plaintext.
import { serverConfig } from "./env.server";

const PREFIX = "v1";
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export class SecretKeyMissingError extends Error {
  constructor() {
    super(
      "INTEGRATIONS_ENCRYPTION_KEY não configurada no servidor. Configure-a para salvar chaves de API.",
    );
    this.name = "SecretKeyMissingError";
  }
}

/** Derives a 256-bit AES key from the configured secret (any length; base64 32 bytes recommended). */
async function importKey(secret: string) {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function hasEncryptionKey() {
  return !!serverConfig.integrations.encryptionKey;
}

export async function encryptSecret(
  plain: string,
  secret = serverConfig.integrations.encryptionKey,
) {
  if (!secret) throw new SecretKeyMissingError();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(secret);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)),
  );
  return `${PREFIX}:${b64(iv)}:${b64(ct)}`;
}

export async function decryptSecret(
  payload: string,
  secret = serverConfig.integrations.encryptionKey,
) {
  if (!secret) throw new SecretKeyMissingError();
  const [v, iv, ct] = payload.split(":");
  if (v !== PREFIX || !iv || !ct) throw new Error("formato de segredo desconhecido");
  const key = await importKey(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct));
  return dec.decode(plain);
}
