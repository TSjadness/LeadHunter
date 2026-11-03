import { describe, expect, it } from "vitest";
import { buildOverpassQuery, dedupe, parseElement } from "@/lib/osm";
import { mapRow, guessMapping } from "@/lib/import";

describe("lead rules", () => {
  it("missing phone stays empty (never invented)", () => {
    const l = parseElement({ type: "node", id: 1, lat: 1, lon: 2, tags: { name: "X" } }, { niche: "bar", uf: "sp" });
    expect(l?.phone).toBeNull();
    expect(l?.instagram).toBeNull();
    expect(l?.state).toBe("SP");
  });
  it("elements without name are discarded", () => {
    expect(parseElement({ type: "node", id: 1, tags: {} }, { niche: "bar", uf: "SP" })).toBeNull();
  });
  it("dedupes by source id", () => {
    expect(dedupe([{ source_id: "a" }, { source_id: "a" }, { source_id: "b" }])).toHaveLength(2);
  });
  it("query caps limit at 500 and maps niche to tag", () => {
    const q = buildOverpassQuery({ niche: "Farmácia", uf: "sp", city: "Campinas", limit: 9999 });
    expect(q).toContain('"amenity"="pharmacy"');
    expect(q).toContain("BR-SP");
    expect(q).toContain("out center tags 500");
  });
  it("import rejects invalid CNPJ and rows without name", () => {
    const m = guessMapping(["Nome", "CNPJ"]);
    expect(mapRow({ Nome: "A", CNPJ: "123" }, m).ok).toBe(false);
    expect(mapRow({ Nome: "", CNPJ: "" }, m).ok).toBe(false);
    expect(mapRow({ Nome: "A", CNPJ: "11.222.333/0001-81" }, m)).toEqual({ ok: true, value: { name: "A", cnpj: "11222333000181" } });
  });
});
