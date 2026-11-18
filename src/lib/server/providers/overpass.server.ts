// Overpass (OpenStreetMap) provider with hedged requests: one mirror at a time, the next
// mirror only starts after a delay or when the previous one fails, and the first success
// cancels the rest. This keeps load on the free public mirrors to a minimum.
import {
  buildOverpassQuery,
  parseElement,
  type BBox,
  type DiscoveredLead,
  type OsmElement,
} from "../../osm";
import { serverConfig } from "../env.server";
import { providerFetch } from "../safe-fetch.server";
import { TtlCache } from "../cache.server";

const cache = new TtlCache<{ items: DiscoveredLead[]; host: string }>(10 * 60_000, 100);

export type OverpassResult = {
  items: DiscoveredLead[];
  host: string | null;
  errors: string[];
  cached: boolean;
};

export async function overpassSearch(
  input: {
    niche: string;
    uf: string;
    city?: string | undefined;
    limit: number;
    bbox?: BBox | undefined;
  },
  signal?: AbortSignal,
): Promise<OverpassResult> {
  const cfg = serverConfig.overpass;
  const timeoutSec = Math.ceil(cfg.timeoutMs / 1000) - 5;
  const query = buildOverpassQuery({ ...input, timeoutSec });
  const hit = cache.get(query);
  if (hit) return { ...hit, items: hit.items.map((i) => ({ ...i })), errors: [], cached: true };

  const endpoints = cfg.endpoints;
  const ctrls = endpoints.map(() => new AbortController());
  const errors: string[] = [];
  const onParentAbort = () => ctrls.forEach((c) => c.abort(signal?.reason));
  signal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    return await new Promise<OverpassResult>((resolve) => {
      let next = 0;
      let pending = 0;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (r: OverpassResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ctrls.forEach((c) => c.abort()); // cancel redundant mirrors
        resolve(r);
      };
      const scheduleHedge = () => {
        clearTimeout(timer);
        if (next < endpoints.length) timer = setTimeout(launch, cfg.hedgeDelayMs);
      };
      function launch() {
        if (settled || next >= endpoints.length || signal?.aborted) return;
        const i = next++;
        const url = endpoints[i]!;
        const host = new URL(url).host;
        pending++;
        scheduleHedge();
        providerFetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
          body: "data=" + encodeURIComponent(query),
          timeoutMs: cfg.timeoutMs,
          signal: ctrls[i]!.signal,
        })
          .then((res) => {
            if (!res.ok)
              throw new Error(
                res.status === 429 ? "limite de uso atingido (429)" : `HTTP ${res.status}`,
              );
            const json = JSON.parse(res.text) as { elements?: OsmElement[]; remark?: string };
            if (!json.elements)
              throw new Error(
                json.remark ? "consulta recusada pelo servidor" : "resposta inválida",
              );
            if (
              json.remark &&
              /timed out|runtime error/i.test(json.remark) &&
              !json.elements.length
            ) {
              throw new Error("tempo de consulta esgotado no servidor");
            }
            const items = json.elements
              .map((e) => parseElement(e, input))
              .filter((x): x is DiscoveredLead => !!x);
            cache.set(query, { items, host });
            finish({ items, host, errors, cached: false });
          })
          .catch((e: unknown) => {
            if (settled) return;
            errors.push(`${host}: ${e instanceof Error ? e.message : "erro"}`);
            launch(); // failure → try the next mirror right away
          })
          .finally(() => {
            pending--;
            if (!settled && pending === 0 && next >= endpoints.length) {
              finish({ items: [], host: null, errors, cached: false });
            }
          });
      }
      if (!endpoints.length)
        finish({
          items: [],
          host: null,
          errors: ["nenhum servidor Overpass configurado"],
          cached: false,
        });
      else launch();
    });
  } finally {
    signal?.removeEventListener("abort", onParentAbort);
  }
}
