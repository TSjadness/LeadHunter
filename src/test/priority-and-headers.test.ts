import { describe, expect, it } from "vitest";
import { parsePriority, priorityLabel } from "@/lib/constants";
import { guessMapping, mapRow } from "@/lib/import";
import { leadPatchSchema } from "@/lib/schemas";
import { toExportRows } from "@/lib/spreadsheet";
import type { Lead } from "@/lib/leads-api";
import {
  buildContentSecurityPolicy,
  securityHeaders,
  withSecurityHeaders,
} from "@/lib/security-headers";

describe("lead priority", () => {
  it("parses labels, numbers and aliases (accent/case-insensitive)", () => {
    expect(parsePriority("Alta")).toBe(3);
    expect(parsePriority(" MÉDIA ")).toBe(2);
    expect(parsePriority("baixa")).toBe(1);
    expect(parsePriority("3")).toBe(3);
    expect(parsePriority(1)).toBe(1);
    expect(parsePriority("urgente")).toBe(3);
    expect(parsePriority("high")).toBe(3);
    expect(parsePriority("altíssima")).toBeNull();
    expect(parsePriority(4)).toBeNull();
    expect(parsePriority(null)).toBeNull();
  });

  it("labels fall back to Média", () => {
    expect(priorityLabel(3)).toBe("Alta");
    expect(priorityLabel(undefined)).toBe("Média");
  });

  it("schema accepts 1–3 and labels, rejects anything else", () => {
    expect(leadPatchSchema.parse({ priority: 3 }).priority).toBe(3);
    expect(leadPatchSchema.parse({ priority: "Baixa" }).priority).toBe(1);
    expect(leadPatchSchema.parse({}).priority).toBeUndefined();
    expect(leadPatchSchema.safeParse({ priority: 7 }).success).toBe(false);
    expect(leadPatchSchema.safeParse({ priority: "talvez" }).success).toBe(false);
  });

  it("import maps a 'Prioridade' column and reports invalid values", () => {
    const mapping = guessMapping(["Nome", "Prioridade"]);
    expect(mapping["Prioridade"]).toBe("priority");
    const ok = mapRow({ Nome: "Clínica X", Prioridade: "alta" }, mapping);
    expect(ok.ok && ok.value.priority).toBe(3);
    const none = mapRow({ Nome: "Clínica Y", Prioridade: "" }, mapping);
    expect(none.ok && none.value.priority).toBeUndefined(); // database default (média)
    const bad = mapRow({ Nome: "Clínica Z", Prioridade: "talvez" }, mapping);
    expect(bad).toEqual({ ok: false, error: 'prioridade inválida ("talvez")' });
  });

  it("export writes the readable label, which the importer reads back", () => {
    const [row] = toExportRows([{ name: "A", priority: 3, source: "manual" } as unknown as Lead]);
    expect(row!["priority"]).toBe("Alta");
    expect(parsePriority(row!["priority"])).toBe(3);
  });
});

describe("security headers", () => {
  const supabase = "https://sdqfjudrpesgjdlesauk.supabase.co";

  it("CSP allows only own origin, Supabase (https + wss) and the map tiles", () => {
    const csp = buildContentSecurityPolicy(supabase);
    expect(csp).toContain(
      `connect-src 'self' https://tiles.openfreemap.org ${supabase} wss://sdqfjudrpesgjdlesauk.supabase.co`,
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toMatch(/script-src[^;]*https?:/); // no external scripts
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("ignores a malformed Supabase URL instead of producing a broken policy", () => {
    expect(buildContentSecurityPolicy("not a url")).toContain(
      "connect-src 'self' https://tiles.openfreemap.org;",
    );
  });

  it("production adds CSP + HSTS; dev keeps the basic headers only", () => {
    const prod = securityHeaders({ supabaseUrl: supabase, production: true });
    expect(prod["Content-Security-Policy"]).toBeDefined();
    expect(prod["Strict-Transport-Security"]).toMatch(/max-age=31536000/);
    expect(prod["X-Frame-Options"]).toBe("DENY");
    const dev = securityHeaders({ supabaseUrl: supabase, production: false });
    expect(dev["Content-Security-Policy"]).toBeUndefined();
    expect(dev["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("adds headers without overriding ones the response already set", async () => {
    const r = new Response("ok", { status: 200, headers: { "X-Frame-Options": "SAMEORIGIN" } });
    const out = withSecurityHeaders(r, {
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    });
    expect(out.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(out.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(out.status).toBe(200);
    expect(await out.text()).toBe("ok");
  });
});
