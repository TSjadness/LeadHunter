import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Save, Phone, Globe, Mail, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";
import { searchLeads } from "@/lib/search.functions";
import { saveLeads } from "@/lib/leads-api";
import type { DiscoveredLead } from "@/lib/osm";
import { NOT_VERIFIED, PAGE_SIZE, UFS } from "@/lib/constants";
import { PageHeader } from "@/components/AppShell";
import { Pager } from "@/components/Pager";
import { LazyLeadMap } from "@/components/LeadMap/Lazy";
import { AddToCollection } from "@/components/AddToCollection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/busca")({
  head: () => ({ meta: [{ title: "Pesquisar leads — LeadHunter" }, { name: "description", content: "Descubra empresas por nicho e localização." }, { property: "og:title", content: "Pesquisar leads — LeadHunter" }, { property: "og:description", content: "Descubra empresas por nicho e localização." }] }),
  component: Busca,
});

const toInsert = (l: DiscoveredLead) => ({ ...l });

function Busca() {
  const qc = useQueryClient();
  const search = useServerFn(searchLeads);
  const [niche, setNiche] = useState("restaurante");
  const [uf, setUf] = useState("SP");
  const [city, setCity] = useState("Campinas");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiscoveredLead[]>([]);
  const [meta, setMeta] = useState<{ provider: string | null; errors: string[] } | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setResults([]); setChecked(new Set()); setPage(1); setSelected(null);
    try {
      const r = await search({ data: { niche, uf, city: city.trim() || undefined, limit } });
      setResults(r.items); setMeta({ provider: r.provider, errors: r.errors });
      if (!r.provider) toast.error("Provedores indisponíveis no momento. Tente novamente.");
      else toast.success(`${r.items.length} empresas encontradas via ${r.provider}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Falha na busca"); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => results.filter((r) => (!onlyPhone || r.phone) && (!filter || r.name.toLowerCase().includes(filter.toLowerCase()))), [results, filter, onlyPhone]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const points = useMemo(() => filtered.filter((r) => r.lat && r.lng).map((r) => ({ id: r.source_id, name: r.name, lat: r.lat!, lng: r.lng! })), [filtered]);
  const sel = results.find((r) => r.source_id === selected);
  const chosen = () => results.filter((r) => checked.has(r.source_id));

  const saveChosen = async (items: DiscoveredLead[]) => {
    const r = await saveLeads(items.map(toInsert));
    await qc.invalidateQueries();
    return r;
  };
  const onSave = async () => {
    try {
      const r = await saveChosen(chosen());
      toast.success(`${r.inserted.length} salvos${r.conflicts.length ? `, ${r.conflicts.length} já existiam` : ""}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <PageHeader title="Pesquisar leads" subtitle="Descoberta geográfica real via OpenStreetMap (Overpass). Campos ausentes na fonte ficam marcados como não verificados." />
      <form onSubmit={run} className="card-surface grid gap-4 p-5 md:grid-cols-[2fr_1fr_2fr_1fr_auto] md:items-end">
        <div className="space-y-1.5"><Label>Nicho</Label><Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="ex.: dentista, academia, pizzaria" required minLength={2} /></div>
        <div className="space-y-1.5"><Label>Estado</Label>
          <Select value={uf} onValueChange={setUf}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{UFS.map(([s, n]) => <SelectItem key={s} value={s}>{s} — {n}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-1.5"><Label>Cidade (opcional)</Label><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Nome exato do município" /></div>
        <div className="space-y-1.5"><Label>Quantidade</Label><Input type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(Math.min(200, Math.max(1, Number(e.target.value) || 1)))} /></div>
        <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Buscar</Button>
      </form>

      {meta && (
        <p className="mt-3 text-xs text-muted-foreground">
          Origem: {meta.provider ?? "nenhum provedor respondeu"} · {results.length} resultado(s) reais
          {meta.errors.length > 0 && ` · fallback: ${meta.errors.join("; ")}`}
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="card-surface flex flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input placeholder="Filtrar por nome" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="h-9 max-w-56" />
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={onlyPhone} onCheckedChange={(v) => { setOnlyPhone(!!v); setPage(1); }} />Só com telefone</label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setChecked(new Set(filtered.map((r) => r.source_id)))} disabled={!filtered.length}>Selecionar todos</Button>
              <Button size="sm" onClick={onSave} disabled={!checked.size}><Save className="h-4 w-4" />Salvar ({checked.size})</Button>
              <AddToCollection disabled={!checked.size} getLeadIds={async () => { const r = await saveChosen(chosen()); return [...r.inserted, ...r.duplicateIds]; }} />
            </div>
          </div>
          {loading && <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Consultando OpenStreetMap…</div>}
          {!loading && !results.length && <p className="py-16 text-center text-sm text-muted-foreground">Faça uma busca para ver empresas reais.</p>}
          <ul className="divide-y divide-border">
            {pageItems.map((r) => (
              <li key={r.source_id} className={`flex cursor-pointer gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted ${selected === r.source_id ? "bg-accent" : ""}`} onClick={() => setSelected(r.source_id)}>
                <Checkbox checked={checked.has(r.source_id)} onCheckedChange={() => toggle(r.source_id)} onClick={(e) => e.stopPropagation()} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.address ?? "Endereço não informado"}{r.city ? ` · ${r.city}` : ""}</div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    <span className={r.phone ? "" : "text-muted-foreground"}><Phone className="mr-1 inline h-3 w-3" />{r.phone ?? NOT_VERIFIED}</span>
                    {r.website && <span><Globe className="mr-1 inline h-3 w-3" />site</span>}
                    {r.email && <span><Mail className="mr-1 inline h-3 w-3" />e-mail</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pager page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
        <div className="flex flex-col gap-4">
          <div className="card-surface h-[420px] p-1"><LazyLeadMap points={points} selectedId={selected} onSelect={setSelected} /></div>
          {sel && (
            <div className="card-surface space-y-2 p-5 text-sm">
              <h3 className="text-lg font-bold">{sel.name}</h3>
              <p><MapPin className="mr-1 inline h-4 w-4 text-marker" />{sel.address ?? NOT_VERIFIED}{sel.city ? `, ${sel.city}` : ""} - {sel.state}</p>
              <p>Telefone: {sel.phone ?? <span className="text-muted-foreground">{NOT_VERIFIED}</span>}</p>
              <p>E-mail: {sel.email ?? <span className="text-muted-foreground">{NOT_VERIFIED}</span>}</p>
              <p>Site: {sel.website ? <a className="text-primary underline" href={sel.website} target="_blank" rel="noreferrer">{sel.website}</a> : <span className="text-muted-foreground">{NOT_VERIFIED}</span>}</p>
              <p>Instagram: {sel.instagram ?? <span className="text-muted-foreground">{NOT_VERIFIED}</span>}</p>
              <p className="text-xs text-muted-foreground">Fonte: OpenStreetMap ({sel.source_id}) · verificado em {new Date(sel.verified_at).toLocaleString("pt-BR")}</p>
              {sel.lat && sel.lng && <Button asChild size="sm" variant="outline"><a href={`https://www.openstreetmap.org/directions?to=${sel.lat}%2C${sel.lng}`} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" />Abrir rota</a></Button>}
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Dados © colaboradores do OpenStreetMap, licença ODbL. Mapa: OpenFreeMap.</p>
    </>
  );
}
