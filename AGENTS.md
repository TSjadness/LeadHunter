## LeadHunter architecture

- Data lives in Supabase tables (leads, lead_status_events, collections, collection_leads, interactions, api_integrations, user_settings) with per-user RLS; schema is versioned in supabase/migrations. Migrations must be additive/idempotent and are tested in src/test/migrations.test.ts (PGlite).
- Client reads/simple writes go through src/lib/leads-api.ts (server-side pagination/filters; dashboard via the lead_dashboard RPC). Writes that need validation or dedupe (saveLeads, integrations) are server functions in src/lib/*.functions.ts.
- All network code is server-only under src/lib/server/** (*.server.ts, loaded with dynamic import inside handlers). External lookups (Overpass hedged mirrors, Nominatim with a global 1 req/s slot, BrasilAPI, custom APIs) run only in authenticated server functions with rate limits; never call providers from the browser.
- User-supplied URLs must go through guardedFetch (SSRF guard). Integration secrets are AES-GCM encrypted with INTEGRATIONS_ENCRYPTION_KEY and never returned to the client. The app never uses the service_role key.
- Pure parsing/validation lives in src/lib/{osm,custom-api,normalize,dedupe,import,schemas,net-guard}.ts so it can be unit-tested; never fabricate missing contact data.
- The map (MapLibre + OpenFreeMap) is browser-only and must be loaded via src/components/LeadMap/Lazy.tsx.
- Env vars: see .env.example. Only VITE_* reach the browser; everything else is read via src/lib/server/env.server.ts.
- Never commit .env / .env.local (they hold secrets); keep .env.example as the template.
