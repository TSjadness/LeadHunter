// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOutboundUrl, isPrivateAddress } from "@/lib/net-guard";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto.server";
import { extractItems } from "@/lib/custom-api";
import { safeCell } from "@/lib/spreadsheet";
import { safeHref } from "@/lib/normalize";
import { ilikeTerm } from "@/lib/leads-api";
import { userMessage } from "@/lib/errors";

describe("SSRF guard (checkOutboundUrl)", () => {
  const blocked = [
    "http://api.exemplo.com/x", // http not allowed by default
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://2130706433/", // decimal 127.0.0.1 (normalised by URL parser)
    "https://0x7f.0.0.1/",
    "https://10.1.2.3/",
    "https://172.16.0.1/",
    "https://192.168.0.10/",
    "https://169.254.169.254/latest/meta-data/", // cloud metadata
    "https://100.64.0.1/",
    "https://[::1]/",
    "https://[::ffff:127.0.0.1]/",
    "https://[fd00::1]/",
    "https://[fe80::1]/",
    "https://metadata.google.internal/",
    "https://service.local/",
    "https://intranet/",
    "https://user:pass@api.exemplo.com/",
    "https://api.exemplo.com:22/",
    "ftp://api.exemplo.com/",
    "javascript:alert(1)",
  ];
  it.each(blocked)("blocks %s", (u) => {
    expect(checkOutboundUrl(u).ok).toBe(false);
  });
  it("allows public https APIs", () => {
    expect(checkOutboundUrl("https://api.exemplo.com.br/v1/empresas?q=x").ok).toBe(true);
    expect(checkOutboundUrl("https://8.8.8.8/").ok).toBe(true);
    expect(checkOutboundUrl("https://api.exemplo.com:8443/").ok).toBe(true);
  });
  it("http only when explicitly allowed", () => {
    expect(checkOutboundUrl("http://api.exemplo.com/", { allowHttp: true }).ok).toBe(true);
  });
  it("classifies addresses resolved by DNS", () => {
    expect(isPrivateAddress("10.0.0.5")).toBe(true);
    expect(isPrivateAddress("2001:db8::1")).toBe(true);
    expect(isPrivateAddress("64:ff9b::a00:1")).toBe(true);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("guardedFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("re-validates redirects and refuses a hop to an internal address", async () => {
    process.env["INTEGRATIONS_DNS_CHECK"] = "false";
    const { guardedFetch } = await import("@/lib/server/safe-fetch.server");
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://169.254.169.254/latest" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      guardedFetch("https://api.exemplo.com/a", { method: "GET", headers: {} }),
    ).rejects.toThrow(/internos|privados/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[1].redirect).toBe("manual");
  });

  it("caps the response size", async () => {
    process.env["INTEGRATIONS_DNS_CHECK"] = "false";
    process.env["INTEGRATIONS_MAX_RESPONSE_BYTES"] = "10000";
    const { guardedFetch } = await import("@/lib/server/safe-fetch.server");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(50_000))),
    );
    await expect(
      guardedFetch("https://api.exemplo.com/a", { method: "GET", headers: {} }),
    ).rejects.toThrow(/grande demais/);
    delete process.env["INTEGRATIONS_MAX_RESPONSE_BYTES"];
  });

  it("refuses domains whose DNS points to private IPs", async () => {
    process.env["INTEGRATIONS_DNS_CHECK"] = "true";
    const { guardedFetch } = await import("@/lib/server/safe-fetch.server");
    const fetchMock = vi.fn(async (input: string | URL) => {
      const u = String(input);
      if (u.includes("dns-query")) {
        return new Response(
          JSON.stringify({
            Answer:
              u.includes("type=A&") || u.endsWith("type=A") ? [{ type: 1, data: "10.0.0.7" }] : [],
          }),
        );
      }
      return new Response("[]");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      guardedFetch("https://rebind.exemplo.com/", { method: "GET", headers: {} }),
    ).rejects.toThrow(/endereço interno/);
    expect(fetchMock.mock.calls.every((c) => String(c[0]).includes("dns-query"))).toBe(true);
  });
});

describe("secret encryption", () => {
  it("round-trips and never stores plaintext", async () => {
    const ct = await encryptSecret("Bearer super-secreto", "chave-de-teste");
    expect(ct.startsWith("v1:")).toBe(true);
    expect(ct).not.toContain("super-secreto");
    expect(await decryptSecret(ct, "chave-de-teste")).toBe("Bearer super-secreto");
  });
  it("uses a fresh IV per encryption", async () => {
    expect(await encryptSecret("x", "k")).not.toBe(await encryptSecret("x", "k"));
  });
  it("fails with the wrong key", async () => {
    const ct = await encryptSecret("abc", "k1");
    await expect(decryptSecret(ct, "k2")).rejects.toThrow();
  });
  it("refuses to run without a configured key", async () => {
    await expect(encryptSecret("abc", undefined)).rejects.toThrow(/INTEGRATIONS_ENCRYPTION_KEY/);
  });
});

describe("injection hardening", () => {
  it("results_path cannot reach the prototype", () => {
    expect(extractItems({ a: [{ name: "x" }] }, "__proto__.polluted")).toEqual([]);
  });
  it("neutralises spreadsheet formulas on export", () => {
    expect(safeCell('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")');
    expect(safeCell("+5511")).toBe("'+5511");
    expect(safeCell("Padaria")).toBe("Padaria");
  });
  it("only renders http(s) links from external data", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,x")).toBeUndefined();
    expect(safeHref("exemplo.com.br")).toBe("https://exemplo.com.br/");
  });
  it("escapes PostgREST filter syntax in search text", () => {
    expect(ilikeTerm("a,b)or(id.eq.1")).toBe("*a b or id.eq.1*");
    expect(ilikeTerm("100%_x")).toBe("*100\\%\\_x*");
    expect(ilikeTerm("   ")).toBe("");
  });
  it("never shows raw validation JSON or stack traces", () => {
    expect(userMessage(new Error('[{"message":"Too small","path":["niche"]}]'))).toBe(
      "Dados inválidos (niche): Too small",
    );
    expect(userMessage(new Error("boom\n    at x (file.js:1:2)"))).toMatch(/Não foi possível/);
    expect(
      userMessage({ code: "42501", message: "new row violates row-level security policy" }),
    ).toMatch(/permissão/);
  });
});
