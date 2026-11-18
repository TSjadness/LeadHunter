// HTTP security headers for every response produced by the server (HTML pages and server
// functions). Pure, so it can be unit-tested; applied in src/server.ts.
//
// CSP notes:
// - script-src needs 'unsafe-inline' because the theme boot script and TanStack's SSR
//   hydration data are inline scripts. External scripts are still blocked.
// - connect-src lists only our own origin, the Supabase project (REST/Auth/Realtime) and
//   the OpenFreeMap tiles; every other provider is called from the server, never the browser.
// - frame-ancestors 'none' (+ X-Frame-Options) blocks clickjacking.

const MAP_ORIGIN = "https://tiles.openfreemap.org";

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(supabaseUrl: string | undefined): string {
  const supabase = originOf(supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'"],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", MAP_ORIGIN],
    "connect-src": ["'self'", MAP_ORIGIN, ...(supabase ? [supabase, supabaseWs!] : [])],
    // MapLibre runs its renderer in a blob: worker.
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

export function securityHeaders(opts: {
  supabaseUrl: string | undefined;
  /** CSP is skipped in dev: Vite's HMR client relies on inline/eval code. */
  production: boolean;
}): Record<string, string> {
  const h: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (opts.production) {
    h["Content-Security-Policy"] = buildContentSecurityPolicy(opts.supabaseUrl);
    // Browsers ignore HSTS on plain http, so this is safe behind any https host.
    h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return h;
}

/** Returns a copy of `response` with the security headers set (existing values win). */
export function withSecurityHeaders(response: Response, headers: Record<string, string>) {
  // 101 (websocket upgrade) responses must be passed through untouched.
  if (response.status === 101) return response;
  const out = new Response(response.body, response);
  for (const [k, v] of Object.entries(headers)) if (!out.headers.has(k)) out.headers.set(k, v);
  return out;
}
