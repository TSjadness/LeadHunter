<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## LeadHunter architecture
- Data lives in Lovable Cloud tables (leads, collections, collection_leads, interactions) with per-user RLS; client CRUD goes through src/lib/leads-api.ts.
- External lookups (Overpass, Nominatim bbox, BrasilAPI) run only in authenticated server functions in src/lib/search.functions.ts, querying providers in parallel so one slow provider never blocks the search.
- Pure parsing/validation lives in src/lib/osm.ts and src/lib/import.ts so it can be unit-tested; never fabricate missing contact data.
- The map (MapLibre + OpenFreeMap) is browser-only and must be loaded via src/components/LeadMap/Lazy.tsx.
