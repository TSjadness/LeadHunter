// Search session store. It lives outside the React tree, so a search keeps running (and its
// results keep arriving) when the user navigates to another page; coming back to /busca shows
// the same filters, progress and results. The state is mirrored to sessionStorage, so a page
// reload restores finished results (a request that was in flight during the reload cannot
// survive it: it is shown as interrupted and the user can run it again).
//
// Results here are *search results*, not leads: nothing is written to the database until the
// user explicitly saves or adds them to a collection.
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { ProviderRow } from "@/components/search/ProviderProgress";
import { supabase } from "@/integrations/supabase/client";
import { mergeDuplicates } from "./dedupe";
import { userMessage } from "./errors";
import type { DiscoveredLead } from "./osm";
import { searchIntegrations, searchOsm, type SearchResult } from "./search.functions";

export type SearchParams = { niche: string; uf: string; city: string; limit: number };
export type ContactFilter = "phone" | "website" | "email" | "social";
export type SearchStatus = "idle" | "running" | "done" | "cancelled" | "interrupted";

export type SearchState = {
  /** Draft form values (kept while navigating). */
  form: SearchParams;
  /** True once defaults from the user settings were applied (or the user typed). */
  formTouched: boolean;
  status: SearchStatus;
  /** Parameters of the last search started. */
  params: SearchParams | null;
  runId: number;
  startedAt: number | null;
  finishedAt: number | null;
  providers: ProviderRow[];
  notices: string[];
  results: DiscoveredLead[];
  /** True when the results came from the recent-search cache (no new request). */
  fromCache: boolean;
  // Result view state.
  filter: string;
  contactFilters: ContactFilter[];
  page: number;
  selected: string | null;
  checked: string[];
  /** source_id → saved lead id (null when saved but the id is unknown). */
  saved: Record<string, string | null>;
  lastDuplicates: string[];
};

const STORAGE_KEY = "lh-search-session-v1";
const CACHE_TTL_MS = 10 * 60_000;

const initialState = (): SearchState => ({
  form: { niche: "", uf: "SP", city: "", limit: 50 },
  formTouched: false,
  status: "idle",
  params: null,
  runId: 0,
  startedAt: null,
  finishedAt: null,
  providers: [],
  notices: [],
  results: [],
  fromCache: false,
  filter: "",
  contactFilters: [],
  page: 1,
  selected: null,
  checked: [],
  saved: {},
  lastDuplicates: [],
});

let state: SearchState = initialState();
let hydrated = false;
let controller: AbortController | null = null;
// Registered by the app shell so a toast can open the results from any page.
let openResults: (() => void) | null = null;
export function setSearchResultsNavigator(fn: (() => void) | null) {
  openResults = fn;
}
const onSearchPage = () =>
  typeof window !== "undefined" && window.location.pathname.startsWith("/busca");
const listeners = new Set<() => void>();

// Recent completed searches (memory only): re-submitting the same search within 10 minutes
// reuses the answer instead of hitting the public providers again.
const recent = new Map<
  string,
  { at: number; result: Pick<SearchState, "providers" | "notices" | "results"> }
>();
export const paramsKey = (p: SearchParams) =>
  JSON.stringify([p.niche.trim().toLowerCase(), p.uf, p.city.trim().toLowerCase(), p.limit]);

function persist() {
  try {
    // Keep only what is needed to restore the screen; skip transient UI bits.
    const { selected: _s, ...rest } = state;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    /* storage full or blocked: the in-memory session still works */
  }
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<SearchState>;
      state = { ...initialState(), ...saved, selected: null };
      if (state.status === "running") {
        // The request died with the previous page; keep what had arrived.
        state = {
          ...state,
          status: "interrupted",
          finishedAt: Date.now(),
          providers: state.providers.map((p) =>
            p.status === "running"
              ? { ...p, status: "skipped", message: "interrompida ao recarregar a página" }
              : p,
          ),
        };
      }
    }
  } catch {
    state = initialState();
  }
  // Never show one account's search to the next person who signs in on this browser.
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") resetSearch();
  });
}

function set(patch: Partial<SearchState> | ((s: SearchState) => Partial<SearchState>)) {
  hydrate();
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function getSnapshot() {
  hydrate();
  return state;
}

const SERVER_SNAPSHOT = initialState();

export function useSearchStore(): SearchState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

export const searchStore = {
  get: getSnapshot,
  set,
};

export function resetSearch() {
  controller?.abort();
  controller = null;
  recent.clear();
  state = initialState();
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export type StartResult = "started" | "cached" | "already-running";

/**
 * Starts a search (or reuses a recent identical one). Concurrency rules:
 * - the same search already running → ignored (no duplicate requests);
 * - a different search → the previous one is aborted and its late answers are dropped.
 */
export function startSearch(params: SearchParams, opts: { force?: boolean } = {}): StartResult {
  hydrate();
  const key = paramsKey(params);
  if (state.status === "running" && state.params && paramsKey(state.params) === key)
    return "already-running";

  const hit = recent.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    controller?.abort();
    controller = null;
    set((s) => ({
      ...hit.result,
      status: "done",
      params,
      runId: s.runId + 1,
      startedAt: hit.at,
      finishedAt: hit.at,
      fromCache: true,
      filter: "",
      page: 1,
      selected: null,
      checked: [],
      lastDuplicates: [],
    }));
    return "cached";
  }

  controller?.abort();
  const ctrl = new AbortController();
  controller = ctrl;
  const runId = state.runId + 1;
  set({
    status: "running",
    params,
    runId,
    startedAt: Date.now(),
    finishedAt: null,
    results: [],
    notices: [],
    fromCache: false,
    filter: "",
    page: 1,
    selected: null,
    checked: [],
    lastDuplicates: [],
    providers: [
      { id: "osm", name: "OpenStreetMap", status: "running", count: 0 },
      { id: "apis", name: "Suas APIs", status: "running", count: 0 },
    ],
  });

  // Ignore answers from an older run (stale responses never overwrite newer results).
  const current = () => !ctrl.signal.aborted && state.runId === runId;
  const merge = (r: SearchResult, groupId: string) => {
    if (!current()) return;
    set((s) => ({
      results: mergeDuplicates([...s.results, ...r.items]).slice(0, params.limit),
      notices: [...new Set([...s.notices, ...r.notices])],
      providers: [...s.providers.filter((p) => p.id !== groupId), ...r.providers],
    }));
  };
  const fail = (groupId: string, name: string, err: unknown) => {
    if (!current()) return;
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === groupId
          ? ({
              id: groupId,
              name,
              status: "error",
              count: 0,
              message: userMessage(err),
            } as ProviderRow)
          : p,
      ),
    }));
  };

  const data = { niche: params.niche, uf: params.uf, city: params.city, limit: params.limit };
  void Promise.all([
    searchOsm({ data, signal: ctrl.signal }).then(
      (r) => merge(r, "osm"),
      (err: unknown) => fail("osm", "OpenStreetMap", err),
    ),
    searchIntegrations({ data, signal: ctrl.signal }).then(
      (r) => {
        if (r.providers.length) merge(r, "apis");
        else if (current()) set((s) => ({ providers: s.providers.filter((p) => p.id !== "apis") }));
      },
      (err: unknown) => fail("apis", "Suas APIs", err),
    ),
  ]).then(() => {
    if (!current()) return;
    const ok = !state.providers.some((p) => p.status === "error");
    if (ok)
      recent.set(key, {
        at: Date.now(),
        result: { providers: state.providers, notices: state.notices, results: state.results },
      });
    set({ status: "done", finishedAt: Date.now() });
    if (controller === ctrl) controller = null;
    // Shown on whatever page the user is on now.
    const n = state.results.length;
    if (n)
      toast.success(`${n} empresa(s) encontrada(s)`, {
        description: `Busca por “${params.niche}” concluída.`,
        ...(openResults && !onSearchPage()
          ? { action: { label: "Ver resultados", onClick: () => openResults?.() } }
          : {}),
      });
    else if (!ok) toast.error("A busca não pôde ser concluída. Veja o status de cada fonte.");
  });
  return "started";
}

export function cancelSearch() {
  if (state.status !== "running") return;
  controller?.abort();
  controller = null;
  set((s) => ({
    status: "cancelled",
    finishedAt: Date.now(),
    providers: s.providers.map((p) =>
      p.status === "running" ? { ...p, status: "skipped", message: "cancelado" } : p,
    ),
  }));
}
