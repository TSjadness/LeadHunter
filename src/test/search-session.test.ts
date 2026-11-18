// Search session store: survives navigation (module state), restores after reload, never
// fires duplicate requests and never lets a stale answer overwrite newer results.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredLead } from "@/lib/osm";

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T>(): Deferred<T> => {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const osmCalls: { data: unknown; d: Deferred<unknown> }[] = [];
const apiCalls: { data: unknown; d: Deferred<unknown> }[] = [];

vi.mock("@/lib/search.functions", () => ({
  searchOsm: vi.fn((opts: { data: unknown }) => {
    const d = deferred<unknown>();
    osmCalls.push({ data: opts.data, d });
    return d.promise;
  }),
  searchIntegrations: vi.fn((opts: { data: unknown }) => {
    const d = deferred<unknown>();
    apiCalls.push({ data: opts.data, d });
    return d.promise;
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const lead = (id: string, name = `Empresa ${id}`): DiscoveredLead => ({
  source: "osm",
  source_id: `node/${id}`,
  name,
  niche: "padaria",
  address: null,
  city: "Campinas",
  state: "SP",
  lat: -22.9 + Number(id) / 100,
  lng: -47.06 + Number(id) / 100,
  phone: null,
  email: null,
  website: null,
  instagram: null,
  facebook: null,
  linkedin: null,
  whatsapp: null,
  cnpj: null,
  verified_at: "2026-11-17T00:00:00.000Z",
  provider: "OpenStreetMap",
});
const osmResult = (items: DiscoveredLead[]) => ({
  items,
  notices: [],
  providers: [{ id: "overpass", name: "Overpass", status: "ok", count: items.length }],
});
const noApis = { items: [], notices: [], providers: [] };
const params = { niche: "padaria", uf: "SP", city: "Campinas", limit: 50 };

async function load() {
  vi.resetModules();
  return import("@/lib/search-store");
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

beforeEach(() => {
  osmCalls.length = 0;
  apiCalls.length = 0;
  sessionStorage.clear();
});

describe("search session store", () => {
  it("keeps running outside React and delivers results to a later subscriber", async () => {
    const store = await load();
    expect(store.startSearch(params)).toBe("started");
    // The page is "gone" (no subscriber); answers still land in the store.
    osmCalls[0]!.d.resolve(osmResult([lead("1"), lead("2")]));
    apiCalls[0]!.d.resolve(noApis);
    await flush();
    // "Coming back" to the page.
    const { result } = renderHook(() => store.useSearchStore());
    expect(result.current.status).toBe("done");
    expect(result.current.results.map((r) => r.source_id)).toEqual(["node/1", "node/2"]);
    expect(result.current.providers.some((p) => p.id === "apis")).toBe(false);
  });

  it("does not fire duplicate requests for the same running search", async () => {
    const store = await load();
    expect(store.startSearch(params)).toBe("started");
    expect(store.startSearch({ ...params, niche: " Padaria " })).toBe("already-running");
    expect(osmCalls).toHaveLength(1);
    expect(apiCalls).toHaveLength(1);
  });

  it("drops late answers from a superseded search", async () => {
    const store = await load();
    store.startSearch(params);
    store.startSearch({ ...params, niche: "academia" });
    expect(osmCalls).toHaveLength(2);
    // The new search answers first, then the old one arrives late.
    osmCalls[1]!.d.resolve(osmResult([lead("9", "Academia Nova")]));
    apiCalls[1]!.d.resolve(noApis);
    await flush();
    osmCalls[0]!.d.resolve(osmResult([lead("1", "Padaria Velha")]));
    apiCalls[0]!.d.resolve(noApis);
    await flush();
    const s = store.searchStore.get();
    expect(s.params?.niche).toBe("academia");
    expect(s.results.map((r) => r.name)).toEqual(["Academia Nova"]);
  });

  it("reuses an identical recent search without new requests, unless forced", async () => {
    const store = await load();
    store.startSearch(params);
    osmCalls[0]!.d.resolve(osmResult([lead("1")]));
    apiCalls[0]!.d.resolve(noApis);
    await flush();
    expect(store.startSearch(params)).toBe("cached");
    expect(osmCalls).toHaveLength(1);
    expect(store.searchStore.get().results).toHaveLength(1);
    expect(store.searchStore.get().fromCache).toBe(true);
    expect(store.startSearch(params, { force: true })).toBe("started");
    expect(osmCalls).toHaveLength(2);
  });

  it("does not cache a search where a provider failed", async () => {
    const store = await load();
    store.startSearch(params);
    osmCalls[0]!.d.reject(new Error("Tempo esgotado"));
    apiCalls[0]!.d.resolve(noApis);
    await flush();
    expect(store.searchStore.get().providers.find((p) => p.id === "osm")?.status).toBe("error");
    expect(store.startSearch(params)).toBe("started");
  });

  it("cancel keeps partial results and marks pending sources", async () => {
    const store = await load();
    store.startSearch(params);
    apiCalls[0]!.d.resolve({
      items: [lead("5")],
      notices: [],
      providers: [{ id: "api:x", name: "Minha API", status: "ok", count: 1 }],
    });
    await flush();
    store.cancelSearch();
    const s = store.searchStore.get();
    expect(s.status).toBe("cancelled");
    expect(s.results).toHaveLength(1);
    expect(s.providers.find((p) => p.id === "osm")?.status).toBe("skipped");
    // A late OSM answer after cancel is ignored.
    osmCalls[0]!.d.resolve(osmResult([lead("1")]));
    await flush();
    expect(store.searchStore.get().results).toHaveLength(1);
  });

  it("restores filters and results after a reload; an in-flight search becomes interrupted", async () => {
    let store = await load();
    store.searchStore.set({ form: { ...params, niche: "padaria" }, formTouched: true });
    store.startSearch(params);
    osmCalls[0]!.d.resolve(osmResult([lead("1"), lead("2")]));
    await flush(); // OSM answered, custom APIs still pending → "reload" now
    store.searchStore.set({ page: 1, filter: "Empresa" });

    store = await load(); // fresh module = page reload (sessionStorage survives)
    const s = store.searchStore.get();
    expect(s.form.niche).toBe("padaria");
    expect(s.filter).toBe("Empresa");
    expect(s.results).toHaveLength(2);
    expect(s.status).toBe("interrupted");
    expect(s.providers.every((p) => p.status !== "running")).toBe(true);
  });

  it("reset clears the session (used on sign-out)", async () => {
    const store = await load();
    store.startSearch(params);
    osmCalls[0]!.d.resolve(osmResult([lead("1")]));
    apiCalls[0]!.d.resolve(noApis);
    await flush();
    store.resetSearch();
    expect(store.searchStore.get().results).toHaveLength(0);
    expect(sessionStorage.getItem("lh-search-session-v1")).toBeNull();
  });
});

describe("theme store", () => {
  it("toggles globally, persists in localStorage and keeps every hook in sync", async () => {
    vi.resetModules();
    localStorage.removeItem("lh-theme");
    const { useTheme } = await import("@/lib/theme");
    const a = renderHook(() => useTheme());
    const b = renderHook(() => useTheme());
    expect(a.result.current.dark).toBe(false);
    act(() => a.result.current.toggle());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("lh-theme")).toBe("dark");
    expect(b.result.current.dark).toBe(true);
    act(() => b.result.current.setMode("light"));
    expect(a.result.current.mode).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("restores the saved choice on load", async () => {
    vi.resetModules();
    localStorage.setItem("lh-theme", "dark");
    const { useTheme } = await import("@/lib/theme");
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("dark");
    expect(result.current.dark).toBe(true);
  });
});
