// Outbound HTTP helpers for the server. Every external call goes through here so that
// timeouts, response-size caps and (for user URLs) SSRF checks are applied uniformly.
import { checkOutboundUrl, isIpLiteral, isPrivateAddress } from "../net-guard";
import { serverConfig } from "./env.server";

export class OutboundError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OutboundError";
  }
}

/** Links an optional caller signal with a timeout; returns the combined signal and a cleanup. */
export function withTimeout(ms: number, parent?: AbortSignal) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) ctrl.abort(parent.reason);
    else parent.addEventListener("abort", onAbort, { once: true });
  }
  const id = setTimeout(() => ctrl.abort(new OutboundError("tempo esgotado")), ms);
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(id);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

/** Reads a body as text, aborting once it exceeds maxBytes. */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel();
    throw new OutboundError("resposta grande demais");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new OutboundError("resposta grande demais");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Fetch for trusted, fixed provider URLs (Overpass, Nominatim, BrasilAPI). */
export async function providerFetch(
  url: string,
  init: RequestInit & { timeoutMs: number; maxBytes?: number; signal?: AbortSignal },
) {
  const { timeoutMs, maxBytes = 20_000_000, signal, ...rest } = init;
  const t = withTimeout(timeoutMs, signal);
  try {
    const headers = new Headers(rest.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", serverConfig.userAgent);
    const res = await fetch(url, { ...rest, headers, signal: t.signal, redirect: "follow" });
    const text = await readCapped(res, maxBytes);
    return { status: res.status, ok: res.ok, text, headers: res.headers };
  } catch (e) {
    if (t.signal.aborted && !signal?.aborted) throw new OutboundError("tempo esgotado");
    throw e;
  } finally {
    t.done();
  }
}

type DohAnswer = { Answer?: { type: number; data: string }[]; Status?: number };

/** Resolves A/AAAA via DNS-over-HTTPS and refuses hosts that point at private ranges. */
async function assertPublicDns(host: string, signal: AbortSignal) {
  if (!serverConfig.integrations.dnsCheck || isIpLiteral(host.replace(/^\[|\]$/g, ""))) return;
  const doh = serverConfig.integrations.dohUrl;
  const ask = async (type: "A" | "AAAA") => {
    const res = await fetch(`${doh}?name=${encodeURIComponent(host)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal,
    });
    if (!res.ok) throw new OutboundError("falha ao verificar o domínio");
    const j = (await res.json()) as DohAnswer;
    return (j.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data);
  };
  const [v4, v6] = await Promise.all([ask("A"), ask("AAAA")]);
  const ips = [...v4, ...v6];
  if (!ips.length) throw new OutboundError("domínio não encontrado");
  if (ips.some(isPrivateAddress))
    throw new OutboundError("o domínio aponta para um endereço interno");
}

/**
 * Fetch for user-supplied URLs: validates scheme/host/port, resolves DNS to block private
 * targets, follows at most `maxRedirects` redirects re-validating each hop, caps the body.
 */
export async function guardedFetch(
  rawUrl: string,
  init: {
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
  opts: { maxRedirects?: number } = {},
) {
  const cfg = serverConfig.integrations;
  const t = withTimeout(cfg.timeoutMs, init.signal);
  try {
    let current = rawUrl;
    let method = init.method;
    let body = init.body;
    for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
      const check = checkOutboundUrl(current, { allowHttp: cfg.allowHttp });
      if (!check.ok) throw new OutboundError(check.reason);
      await assertPublicDns(check.url.hostname, t.signal);
      const res = await fetch(check.url, {
        method,
        headers: { "user-agent": serverConfig.userAgent, ...init.headers },
        ...(body != null ? { body } : {}),
        redirect: "manual",
        signal: t.signal,
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        await res.body?.cancel();
        current = new URL(res.headers.get("location")!, check.url).href;
        if (
          res.status === 303 ||
          ((res.status === 301 || res.status === 302) && method === "POST")
        ) {
          method = "GET";
          body = undefined;
        }
        continue;
      }
      const text = await readCapped(res, cfg.maxResponseBytes);
      return { status: res.status, ok: res.ok, text };
    }
    throw new OutboundError("redirecionamentos demais");
  } catch (e) {
    if (t.signal.aborted && !init.signal?.aborted) throw new OutboundError("tempo esgotado");
    if (e instanceof OutboundError) throw e;
    throw new OutboundError("não foi possível conectar à API");
  } finally {
    t.done();
  }
}
