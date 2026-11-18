// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const okBody = JSON.stringify({
  elements: [{ type: "node", id: 1, lat: -22.9, lon: -47.06, tags: { name: "Padaria Sol" } }],
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete process.env["OVERPASS_ENDPOINTS"];
  delete process.env["OVERPASS_HEDGE_DELAY_MS"];
});

describe("Overpass hedged requests", () => {
  it("tries one mirror at a time and moves on immediately when one fails", async () => {
    process.env["OVERPASS_ENDPOINTS"] = "https://a.test/api,https://b.test/api,https://c.test/api";
    process.env["OVERPASS_HEDGE_DELAY_MS"] = "30000";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(new URL(url).host);
        if (url.includes("a.test")) return new Response("busy", { status: 429 });
        return new Response(okBody);
      }),
    );
    const { overpassSearch } = await import("@/lib/server/providers/overpass.server");
    const r = await overpassSearch({ niche: "padaria", uf: "SP", limit: 10 });
    expect(r.host).toBe("b.test");
    expect(r.items[0]?.name).toBe("Padaria Sol");
    expect(calls).toEqual(["a.test", "b.test"]); // c.test was never hit
    expect(r.errors[0]).toMatch(/429/);
  });

  it("starts a backup mirror after the hedge delay and cancels the slow one", async () => {
    process.env["OVERPASS_ENDPOINTS"] = "https://slow.test/api,https://fast.test/api";
    process.env["OVERPASS_HEDGE_DELAY_MS"] = "1000";
    let slowAborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        if (url.includes("slow")) {
          return new Promise<Response>((_, reject) => {
            init.signal?.addEventListener("abort", () => {
              slowAborted = true;
              reject(new DOMException("aborted", "AbortError"));
            });
          });
        }
        return Promise.resolve(new Response(okBody));
      }),
    );
    const { overpassSearch } = await import("@/lib/server/providers/overpass.server");
    const r = await overpassSearch({ niche: "padaria", uf: "MG", limit: 10 });
    expect(r.host).toBe("fast.test");
    expect(slowAborted).toBe(true);
  });

  it("serves identical queries from cache (no new network call)", async () => {
    process.env["OVERPASS_ENDPOINTS"] = "https://a.test/api";
    const f = vi.fn(async () => new Response(okBody));
    vi.stubGlobal("fetch", f);
    const { overpassSearch } = await import("@/lib/server/providers/overpass.server");
    await overpassSearch({ niche: "padaria", uf: "RS", limit: 10 });
    const second = await overpassSearch({ niche: "padaria", uf: "RS", limit: 10 });
    expect(second.cached).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("reports failure when every mirror fails", async () => {
    process.env["OVERPASS_ENDPOINTS"] = "https://a.test/api,https://b.test/api";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("err", { status: 504 })),
    );
    const { overpassSearch } = await import("@/lib/server/providers/overpass.server");
    const r = await overpassSearch({ niche: "padaria", uf: "BA", limit: 10 });
    expect(r.host).toBeNull();
    expect(r.items).toEqual([]);
    expect(r.errors).toHaveLength(2);
  });
});

describe("rate limit helper", () => {
  it("falls back to an in-memory limit when the DB function is missing", async () => {
    const { enforceRateLimit } = await import("@/lib/server/rate-limit.server");
    const sb = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "not found" } }),
    } as never;
    await enforceRateLimit(sb, "u1", "search", 2);
    await enforceRateLimit(sb, "u1", "search", 2);
    await expect(enforceRateLimit(sb, "u1", "search", 2)).rejects.toThrow(/Muitas solicitações/);
  });
  it("blocks when the DB says the quota is used", async () => {
    const { enforceRateLimit } = await import("@/lib/server/rate-limit.server");
    const sb = { rpc: async () => ({ data: false, error: null }) } as never;
    await expect(enforceRateLimit(sb, "u2", "cnpj", 10)).rejects.toThrow(/Muitas solicitações/);
  });
});
