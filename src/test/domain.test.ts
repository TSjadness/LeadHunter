import { describe, expect, it } from "vitest";
import {
  formatCnpj,
  isValidCnpj,
  normalizeCnpj,
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
  normalizeUrl,
  normalizeWhatsapp,
  validCoord,
} from "@/lib/normalize";
import { mergeDuplicates, sameBusiness } from "@/lib/dedupe";
import { guessMapping, mapRow } from "@/lib/import";
import { parseStatus } from "@/lib/constants";
import { nominatimInState, parseElement, parseNominatim } from "@/lib/osm";
import { leadFieldsSchema, searchInputSchema } from "@/lib/schemas";
import { passwordProblem } from "@/lib/auth";
import { mapBrasilApi } from "@/lib/server/providers/brasilapi.server";

describe("CNPJ", () => {
  it("validates numeric check digits", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("123")).toBe(false);
  });
  it("supports the alphanumeric CNPJ (2026+)", () => {
    // Example published by the Receita Federal for the new format.
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(isValidCnpj("12ABC34501DE36")).toBe(false);
  });
  it("strips the BR prefix of OSM ref:vatin", () => {
    expect(normalizeCnpj("BR11222333000181")).toBe("11222333000181");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("contact normalisation (formats only, never invents)", () => {
  it("formats Brazilian phones", () => {
    expect(normalizePhone("(19) 3232-1234")).toBe("+55 19 3232-1234");
    expect(normalizePhone("+55 11 98765-4321")).toBe("+55 11 98765-4321");
    expect(normalizePhone("011 3232 1234")).toBe("+55 11 3232-1234");
    expect(normalizePhone("+55 19 3232-1234; +55 19 3232-9999")).toBe("+55 19 3232-1234");
    expect(normalizePhone("0800 123 4567")).toBe("0800 123 4567");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it("normalises web/social values", () => {
    expect(normalizeUrl("www.padaria.com.br")).toBe("https://www.padaria.com.br/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeInstagram("@padaria.sol")).toBe("https://www.instagram.com/padaria.sol");
    expect(normalizeInstagram("https://evil.com/x")).toBeNull();
    expect(normalizeEmail("MAILTO:Contato@Padaria.com.br")).toBe("contato@padaria.com.br");
    expect(normalizeEmail("não tem")).toBeNull();
    expect(normalizeWhatsapp("https://wa.me/5519999998888")).toBe("+55 19 99999-8888");
  });
  it("drops invalid coordinates", () => {
    expect(validCoord(0, 0)).toBeNull();
    expect(validCoord("-22.9", "-47.06")).toEqual({ lat: -22.9, lng: -47.06 });
    expect(validCoord(120, 10)).toBeNull();
  });
});

describe("duplicate detection", () => {
  const a = {
    name: "Subway",
    city: "Campinas",
    lat: -22.9,
    lng: -47.06,
    source: "osm",
    source_id: "node/1",
  };
  it("keeps branches of a chain (same name, different place)", () => {
    const b = {
      name: "Subway",
      city: "Campinas",
      lat: -22.85,
      lng: -47.1,
      source: "osm",
      source_id: "node/2",
    };
    expect(sameBusiness(a, b)).toBeNull();
  });
  it("matches the same place from two providers", () => {
    const b = {
      name: "SUBWAY",
      city: "Campinas",
      lat: -22.9003,
      lng: -47.0602,
      source: "api",
      source_id: "x",
    };
    expect(sameBusiness(a, b)).toBe("name_location");
  });
  it("matches by provider id and by CNPJ; different CNPJs are different companies", () => {
    expect(sameBusiness(a, { ...a, name: "Outro nome" })).toBe("source");
    expect(
      sameBusiness(
        { name: "A", cnpj: "11222333000181" },
        { name: "B", cnpj: "11.222.333/0001-81" },
      ),
    ).toBe("cnpj");
    expect(
      sameBusiness({ name: "A", cnpj: "11222333000181" }, { name: "A", cnpj: "12ABC34501DE35" }),
    ).toBeNull();
  });
  it("without coordinates, same name + city + address (or unknown address) is a duplicate", () => {
    expect(
      sameBusiness({ name: "Ótica Luz", city: "Aracaju" }, { name: "otica luz", city: "ARACAJU" }),
    ).toBe("name_location");
    expect(
      sameBusiness(
        { name: "Ótica Luz", city: "Aracaju", address: "Rua A, 1" },
        { name: "Ótica Luz", city: "Aracaju", address: "Rua B, 9" },
      ),
    ).toBeNull();
    expect(
      sameBusiness({ name: "Ótica Luz", city: "Aracaju" }, { name: "Ótica Luz", city: "Lagarto" }),
    ).toBeNull();
  });
  it("merges fields from duplicates without inventing", () => {
    const merged = mergeDuplicates([
      { ...a, phone: null as string | null, website: "https://a.com" },
      {
        ...a,
        source: "api",
        source_id: "z",
        lat: -22.9001,
        phone: "+55 19 3232-1234" as string | null,
        website: null as string | null,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.phone).toBe("+55 19 3232-1234");
    expect(merged[0]!.website).toBe("https://a.com");
  });
});

describe("import", () => {
  it("maps headers (accents, BOM, aliases) without double-mapping", () => {
    expect(guessMapping(["\uFEFFNome", "Município", "Telefone", "Celular"])).toEqual({
      "\uFEFFNome": "name",
      Município: "city",
      Telefone: "phone",
      Celular: "",
    });
  });
  it("validates status labels from spreadsheets", () => {
    const m = guessMapping(["Nome", "Status"]);
    expect(mapRow({ Nome: "A", Status: "Em contato" }, m)).toEqual({
      ok: true,
      value: { name: "A", status: "contato" },
    });
    expect(mapRow({ Nome: "A", Status: "Prospect" }, m)).toMatchObject({ ok: false });
    expect(parseStatus("Negociação")).toBe("negociacao");
  });
  it("rejects invalid e-mail, CNPJ and UF", () => {
    const m = guessMapping(["Nome", "Email", "CNPJ", "UF"]);
    expect(mapRow({ Nome: "A", Email: "x@", CNPJ: "", UF: "" }, m)).toEqual({
      ok: false,
      error: "e-mail inválido",
    });
    expect(mapRow({ Nome: "A", Email: "", CNPJ: "11222333000182", UF: "" }, m)).toEqual({
      ok: false,
      error: "CNPJ inválido",
    });
    expect(mapRow({ Nome: "A", Email: "", CNPJ: "", UF: "XX" }, m)).toEqual({
      ok: false,
      error: "UF inválida",
    });
  });
  it("normalises contact data", () => {
    const m = guessMapping(["Nome", "Telefone", "Site"]);
    expect(
      mapRow({ Nome: " Padaria  Sol ", Telefone: "(79) 3211-0000", Site: "padariasol.com.br" }, m),
    ).toEqual({
      ok: true,
      value: {
        name: "Padaria Sol",
        phone: "+55 79 3211-0000",
        website: "https://padariasol.com.br/",
      },
    });
  });
});

describe("providers", () => {
  it("OSM: reads social/WhatsApp tags and only valid CNPJs", () => {
    const l = parseElement(
      {
        type: "node",
        id: 9,
        lat: -10.9,
        lon: -37.05,
        tags: {
          name: "Pet X",
          "contact:instagram": "petx",
          "contact:whatsapp": "+55 79 99999-0000",
          "ref:vatin": "BR11222333000182",
        },
      },
      { niche: "pet shop", uf: "SE" },
    );
    expect(l?.instagram).toBe("https://www.instagram.com/petx");
    expect(l?.whatsapp).toBe("+55 79 99999-0000");
    expect(l?.cnpj).toBeNull(); // invalid check digits are not stored
  });
  it("Nominatim: filters by state using ISO code", () => {
    const p = { osm_type: "node", osm_id: 1, name: "Bar", address: { "ISO3166-2-lvl4": "BR-RJ" } };
    expect(nominatimInState(p, "SP", "São Paulo")).toBe(false);
    expect(nominatimInState(p, "RJ", "Rio de Janeiro")).toBe(true);
    expect(nominatimInState(p, "BR", "Brasil")).toBe(true);
    expect(parseNominatim(p, { niche: "bar", uf: "BR" })?.state).toBe("RJ");
  });
  it("BrasilAPI mapping keeps missing data null", () => {
    const d = mapBrasilApi({
      razao_social: "ACME LTDA",
      nome_fantasia: "",
      uf: "SP",
      ddd_telefone_1: "1932321234",
    });
    expect(d).toMatchObject({
      legal_name: "ACME LTDA",
      trade_name: null,
      state: "SP",
      phone: "+55 19 3232-1234",
      email: null,
    });
  });
});

describe("schemas", () => {
  it("search accepts Brasil inteiro or a UF", () => {
    expect(searchInputSchema.safeParse({ niche: "bar", uf: "BR", limit: 10 }).success).toBe(true);
    expect(searchInputSchema.safeParse({ niche: "bar", uf: "XX", limit: 10 }).success).toBe(false);
    expect(searchInputSchema.safeParse({ niche: "b", uf: "SP", limit: 10 }).success).toBe(false);
    expect(searchInputSchema.safeParse({ niche: "bar", uf: "SP", limit: 999 }).success).toBe(false);
  });
  it("lead schema rejects ownership/injection fields and unknown statuses", () => {
    const r = leadFieldsSchema.safeParse({ name: "A", user_id: "someone-else", status: "hacked" });
    expect(r.success).toBe(false);
    const ok = leadFieldsSchema.parse({ name: "A", user_id: "someone-else" });
    expect("user_id" in ok).toBe(false); // unknown keys are stripped
  });
  it("password policy", () => {
    expect(passwordProblem("abc123")).toMatch(/8/);
    expect(passwordProblem("abcdefgh")).toMatch(/letras e números/);
    expect(passwordProblem("abcd1234")).toBeNull();
  });
});

describe("nominatim queries", () => {
  it("uses the OSM category phrase first, then plain words (no 'em', no commas)", async () => {
    const { nominatimQueries } = await import("@/lib/osm");
    expect(nominatimQueries("padaria", "Campinas")).toEqual([
      "bakery in Campinas",
      "padaria Campinas",
    ]);
    expect(nominatimQueries("Academia", "São Paulo")).toEqual([
      "fitness centre in São Paulo",
      "Academia São Paulo",
    ]);
    expect(nominatimQueries("marmoraria", "Aracaju")).toEqual(["marmoraria Aracaju"]);
  });
});
