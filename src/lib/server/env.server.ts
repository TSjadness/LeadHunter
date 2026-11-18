// Server-only configuration. Never import this from client code (the .server.ts suffix
// keeps it out of the browser bundle). Every value is optional and has a safe default,
// so the app runs with whatever providers are actually configured.

function read(name: string): string | undefined {
  const v = typeof process !== "undefined" ? process.env[name] : undefined;
  return v != null && v.trim() !== "" ? v.trim() : undefined;
}

function bool(name: string, fallback: boolean) {
  const v = read(name)?.toLowerCase();
  if (v == null) return fallback;
  return ["1", "true", "yes", "on"].includes(v);
}

function int(name: string, fallback: number, min: number, max: number) {
  const n = Number(read(name));
  return Number.isFinite(n) && read(name) != null
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
}

function list(name: string, fallback: string[]) {
  const v = read(name);
  return v
    ? v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : fallback;
}

export const DEFAULT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export function supabaseServerConfig() {
  // Server falls back to the public VITE_* values, so a single pair is enough to run.
  const url = read("SUPABASE_URL") ?? import.meta.env["VITE_SUPABASE_URL"];
  const key =
    read("SUPABASE_PUBLISHABLE_KEY") ??
    read("SUPABASE_ANON_KEY") ??
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  return { url: url as string | undefined, key: key as string | undefined };
}

export const serverConfig = {
  get userAgent() {
    const contact = read("PROVIDER_CONTACT_EMAIL");
    return (
      read("PROVIDER_USER_AGENT") ??
      `LeadHunter/2.0 (lead discovery app${contact ? `; contact: ${contact}` : ""})`
    );
  },
  get contactEmail() {
    return read("PROVIDER_CONTACT_EMAIL");
  },
  overpass: {
    get enabled() {
      return bool("OVERPASS_ENABLED", true);
    },
    get endpoints() {
      return list("OVERPASS_ENDPOINTS", DEFAULT_OVERPASS_ENDPOINTS);
    },
    get timeoutMs() {
      return int("OVERPASS_TIMEOUT_MS", 60000, 5000, 90000);
    },
    /** Delay before racing the next mirror (hedged requests instead of hitting all at once). */
    get hedgeDelayMs() {
      return int("OVERPASS_HEDGE_DELAY_MS", 6000, 1000, 30000);
    },
  },
  nominatim: {
    get enabled() {
      return bool("NOMINATIM_ENABLED", true);
    },
    get baseUrl() {
      return (read("NOMINATIM_URL") ?? "https://nominatim.openstreetmap.org").replace(/\/+$/, "");
    },
    get timeoutMs() {
      return int("NOMINATIM_TIMEOUT_MS", 12000, 2000, 30000);
    },
    /** Public Nominatim policy: max 1 request/second for the whole application. */
    get minIntervalMs() {
      return int("NOMINATIM_MIN_INTERVAL_MS", 1100, 1000, 10000);
    },
  },
  brasilapi: {
    get enabled() {
      return bool("BRASILAPI_ENABLED", true);
    },
    get baseUrl() {
      return (read("BRASILAPI_URL") ?? "https://brasilapi.com.br").replace(/\/+$/, "");
    },
    get timeoutMs() {
      return int("BRASILAPI_TIMEOUT_MS", 15000, 2000, 30000);
    },
  },
  integrations: {
    get enabled() {
      return bool("CUSTOM_INTEGRATIONS_ENABLED", true);
    },
    get allowHttp() {
      return bool("INTEGRATIONS_ALLOW_HTTP", false);
    },
    get dnsCheck() {
      return bool("INTEGRATIONS_DNS_CHECK", true);
    },
    get dohUrl() {
      return read("INTEGRATIONS_DOH_URL") ?? "https://cloudflare-dns.com/dns-query";
    },
    get maxResponseBytes() {
      return int("INTEGRATIONS_MAX_RESPONSE_BYTES", 2_000_000, 10_000, 10_000_000);
    },
    get timeoutMs() {
      return int("INTEGRATIONS_TIMEOUT_MS", 15000, 1000, 30000);
    },
    get maxPerUser() {
      return int("INTEGRATIONS_MAX_PER_USER", 10, 1, 100);
    },
    get encryptionKey() {
      return read("INTEGRATIONS_ENCRYPTION_KEY");
    },
  },
  rateLimit: {
    get searchPerMinute() {
      return int("RATE_LIMIT_SEARCH_PER_MINUTE", 6, 1, 1000);
    },
    get cnpjPerMinute() {
      return int("RATE_LIMIT_CNPJ_PER_MINUTE", 10, 1, 1000);
    },
    get integrationTestPerMinute() {
      return int("RATE_LIMIT_INTEGRATION_TEST_PER_MINUTE", 5, 1, 1000);
    },
    get writesPerMinute() {
      return int("RATE_LIMIT_WRITES_PER_MINUTE", 30, 1, 10000);
    },
  },
};
