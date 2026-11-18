import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FolderPlus,
  Info,
  Loader2,
  MapPin,
  Navigation,
  RotateCw,
  Save,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { saveLeads } from "@/lib/leads.functions";
import {
  addToCollection,
  invalidateCollectionViews,
  saveSettings,
  settingsQuery,
} from "@/lib/leads-api";
import type { DiscoveredLead } from "@/lib/osm";
import { NOT_VERIFIED, PAGE_SIZE } from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { usePersistentState } from "@/lib/theme";
import {
  cancelSearch,
  searchStore,
  startSearch,
  useSearchStore,
  type ContactFilter,
  type SearchParams,
} from "@/lib/search-store";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { ContactLinks } from "@/components/common/ContactLinks";
import { EmptyState, Pager } from "@/components/common";
import { LazyLeadMap } from "@/components/LeadMap/Lazy";
import { ProviderProgress } from "@/components/search/ProviderProgress";
import { SearchGuideButton, SearchGuideStrip } from "@/components/search/SearchGuide";
import { SearchFilters } from "@/components/SearchFilters";
import { AddToCollectionModal, type PickedCollection } from "@/components/AddToCollectionModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/busca")({
  head: () => ({
    meta: [
      { title: "Pesquisar leads — LeadHunter" },
      { name: "description", content: "Descubra empresas por segmento e localização." },
    ],
  }),
  component: Busca,
});

const CONTACT_FILTERS: { id: ContactFilter; label: string }[] = [
  { id: "phone", label: "Telefone" },
  { id: "website", label: "Site" },
  { id: "email", label: "E-mail" },
  { id: "social", label: "Redes sociais" },
];

const hasContact = (r: DiscoveredLead, f: ContactFilter) =>
  f === "phone"
    ? !!(r.phone || r.whatsapp)
    : f === "social"
      ? !!(r.instagram || r.facebook || r.linkedin)
      : !!r[f];

function toSavePayload(l: DiscoveredLead) {
  const { provider: _p, ...rest } = l;
  return rest;
}

// Stable store actions (module scope → memoized rows don't re-render needlessly).
const selectResult = (id: string | null) => searchStore.set({ selected: id });
const toggleChecked = (id: string) =>
  searchStore.set((s) => ({
    checked: s.checked.includes(id) ? s.checked.filter((x) => x !== id) : [...s.checked, id],
  }));

const ResultRow = memo(function ResultRow({
  r,
  isSaved,
  isChecked,
  isSelected,
  onAddToCollection,
}: {
  r: DiscoveredLead;
  isSaved: boolean;
  isChecked: boolean;
  isSelected: boolean;
  onAddToCollection: (r: DiscoveredLead) => void;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => selectResult(r.source_id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectResult(r.source_id);
          }
        }}
        aria-pressed={isSelected}
        className={cn(
          "group flex cursor-pointer gap-3 rounded-lg px-2 py-3 outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring",
          isSelected && "bg-accent/70",
        )}
      >
        <Checkbox
          checked={isChecked}
          onCheckedChange={() => toggleChecked(r.source_id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-1"
          aria-label={`Selecionar ${r.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{r.name}</span>
            {isSaved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                <CheckCircle2 className="h-3 w-3" /> salvo
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {r.address ?? "Endereço não informado"}
            {r.city ? ` · ${r.city}` : ""}
            {r.state ? `/${r.state}` : ""}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className={r.phone ? "" : "text-muted-foreground"}>
              {r.phone ?? `Telefone: ${NOT_VERIFIED.toLowerCase()}`}
            </span>
            {r.whatsapp && <span className="text-success">WhatsApp</span>}
            {r.website && <span className="text-primary">site</span>}
            {r.email && <span className="text-primary">e-mail</span>}
            {(r.instagram || r.facebook || r.linkedin) && (
              <span className="text-primary">redes</span>
            )}
            {r.cnpj && <span className="text-muted-foreground">CNPJ</span>}
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 self-center text-muted-foreground opacity-100 transition-opacity hover:text-primary md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCollection(r);
          }}
          aria-label={`Adicionar ${r.name} à coleção`}
          title="Adicionar à coleção"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
});

function Busca() {
  const qc = useQueryClient();
  const st = useSearchStore();
  const { data: settings } = useQuery(settingsQuery);
  const [guideHidden, setGuideHidden] = usePersistentState("lh-search-guide-dismissed", false);
  const [saving, setSaving] = useState(false);
  const [collectionTarget, setCollectionTarget] = useState<DiscoveredLead[] | null>(null);

  // Default UF/city from the user settings, only while the form is untouched.
  useEffect(() => {
    if (!settings || searchStore.get().formTouched) return;
    searchStore.set((s) => ({
      formTouched: true,
      form: {
        ...s.form,
        uf: settings.default_uf || s.form.uf,
        city: settings.default_city || s.form.city,
      },
    }));
  }, [settings]);

  const running = st.status === "running";
  const searched = st.status !== "idle";
  const { results, filter, contactFilters, page, selected, saved } = st;
  const checked = useMemo(() => new Set(st.checked), [st.checked]);

  const onFormChange = useCallback(
    (patch: Partial<SearchParams>) =>
      searchStore.set((s) => ({ form: { ...s.form, ...patch }, formTouched: true })),
    [],
  );
  const onSubmit = (p: SearchParams) => {
    const r = startSearch(p);
    if (r === "cached")
      toast.message("Resultados recentes reaproveitados", {
        description: "A mesma busca foi feita há menos de 10 minutos.",
      });
    else if (r === "already-running") toast.message("Essa busca já está em andamento.");
  };
  const onCancel = () => {
    cancelSearch();
    toast.message("Busca cancelada", {
      description: "Os resultados que já chegaram foram mantidos.",
    });
  };

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return results.filter(
      (r) =>
        contactFilters.every((c) => hasContact(r, c)) &&
        (!f || `${r.name} ${r.address ?? ""} ${r.city ?? ""}`.toLowerCase().includes(f)),
    );
  }, [results, filter, contactFilters]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const points = useMemo(
    () =>
      filtered
        .filter((r) => r.lat != null && r.lng != null)
        .map((r) => ({ id: r.source_id, name: r.name, lat: r.lat!, lng: r.lng! })),
    [filtered],
  );
  const sel = results.find((r) => r.source_id === selected);
  const checkedItems = results.filter((r) => checked.has(r.source_id));
  const unsavedChecked = checkedItems.filter((r) => !(r.source_id in saved));

  const toggleContact = (c: ContactFilter) =>
    searchStore.set((s) => ({
      contactFilters: s.contactFilters.includes(c)
        ? s.contactFilters.filter((x) => x !== c)
        : [...s.contactFilters, c],
      page: 1,
    }));

  /**
   * Saves the given results (server-side dedupe) and returns source_id → lead id for all of
   * them that exist in the database. Only explicit user actions call this.
   */
  const persistResults = async (items: DiscoveredLead[]) => {
    const ids = new Map<string, string>();
    const toSave: DiscoveredLead[] = [];
    for (const it of items) {
      const id = saved[it.source_id];
      if (id) ids.set(it.source_id, id);
      else toSave.push(it);
    }
    if (!toSave.length) return { ids, inserted: 0, duplicates: [] as string[] };
    const r = await saveLeads({ data: { items: toSave.map(toSavePayload) } });
    for (const i of r.inserted) if (i.source_id) ids.set(i.source_id, i.id);
    for (const d of r.duplicates)
      if (d.source_id && d.existingId) ids.set(d.source_id, d.existingId);
    searchStore.set((s) => {
      const next = { ...s.saved };
      for (const it of toSave) next[it.source_id] = ids.get(it.source_id) ?? null;
      return { saved: next, lastDuplicates: r.duplicates.map((d) => d.name) };
    });
    await qc.invalidateQueries({ queryKey: ["leads"] });
    return { ids, inserted: r.inserted.length, duplicates: r.duplicates.map((d) => d.name) };
  };

  const onSave = async () => {
    if (!unsavedChecked.length) return;
    setSaving(true);
    try {
      const r = await persistResults(unsavedChecked);
      searchStore.set({ checked: [] });
      toast.success(`${r.inserted} lead(s) salvo(s)`, {
        description: r.duplicates.length
          ? `${r.duplicates.length} já existiam e foram ignorados.`
          : undefined,
      });
    } catch (err) {
      toast.error(userMessage(err, "Não foi possível salvar os leads. Tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  const onAddToCollection = useCallback((r: DiscoveredLead) => setCollectionTarget([r]), []);

  // Throws on failure so the modal stays open and shows the error.
  const addTargetToCollection = async (c: PickedCollection) => {
    const items = collectionTarget ?? [];
    const { ids } = await persistResults(items);
    const leadIds = [...new Set(ids.values())];
    if (!leadIds.length) throw new Error("Não foi possível identificar os leads salvos.");
    await addToCollection(c.id, leadIds);
    await invalidateCollectionViews(qc);
    if (items.length > 1) searchStore.set({ checked: [] });
    const skipped = items.length - leadIds.length;
    toast.success(`${leadIds.length} lead(s) em “${c.name}”`, {
      description:
        skipped > 0
          ? `${skipped} resultado(s) eram a mesma empresa de outro item e foram unificados.`
          : "Quem já estava na coleção não foi duplicado.",
    });
  };

  const dismissGuide = () => {
    setGuideHidden(true);
    saveSettings({ search_guide_dismissed: true }).catch(() => undefined);
  };
  const showGuide = !guideHidden && settings?.search_guide_dismissed !== true;

  const progressNote =
    st.fromCache && st.params ? (
      <>
        Resultado reaproveitado de uma busca idêntica recente.{" "}
        <button
          type="button"
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => st.params && startSearch(st.params, { force: true })}
        >
          <RotateCw className="mr-1 inline h-3 w-3" />
          Buscar de novo
        </button>
      </>
    ) : st.status === "interrupted" ? (
      "A página foi recarregada durante a busca. Os resultados que já tinham chegado foram mantidos; busque de novo para completar."
    ) : null;

  return (
    <>
      <PageHeader
        icon={Search}
        title="Pesquisar leads"
        subtitle="Empresas reais do OpenStreetMap e das suas APIs. Campos que a fonte não informa ficam marcados como não verificados."
        actions={<SearchGuideButton />}
      />
      {showGuide && <SearchGuideStrip onDismiss={dismissGuide} />}

      <SearchFilters
        value={st.form}
        onChange={onFormChange}
        running={running}
        showSuggestions={!searched && !st.form.niche}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />

      <ProviderProgress
        rows={st.providers}
        startedAt={st.startedAt}
        finishedAt={st.finishedAt}
        note={progressNote}
      />
      {st.notices.length > 0 && (
        <div className="mt-3 space-y-1">
          {st.notices.map((n) => (
            <p
              key={n}
              className="flex items-start gap-2 rounded-lg bg-accent/60 px-3 py-2 text-xs text-accent-foreground"
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {n}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="card-surface flex min-w-0 flex-col p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-60">
              <Input
                placeholder="Filtrar resultados"
                value={filter}
                onChange={(e) => searchStore.set({ filter: e.target.value, page: 1 })}
                className="h-9 pr-8"
                aria-label="Filtrar por nome ou endereço"
              />
              {filter && (
                <button
                  className="absolute inset-y-0 right-0 grid w-8 place-items-center text-muted-foreground"
                  onClick={() => searchStore.set({ filter: "", page: 1 })}
                  aria-label="Limpar filtro"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Exigir contato">
              {CONTACT_FILTERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleContact(c.id)}
                  aria-pressed={contactFilters.includes(c.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    contactFilters.includes(c.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <span className="text-xs text-muted-foreground">
              {filtered.length} de {results.length} resultado(s)
              {checked.size ? ` · ${checked.size} selecionado(s)` : ""}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  searchStore.set({
                    checked: checked.size ? [] : filtered.map((r) => r.source_id),
                  })
                }
                disabled={!filtered.length}
              >
                {checked.size ? "Limpar seleção" : "Selecionar todos"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCollectionTarget(checkedItems)}
                disabled={!checkedItems.length || saving}
              >
                <FolderPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Adicionar à coleção</span>
                <span className="sm:hidden">Coleção</span> ({checkedItems.length})
              </Button>
              <Button
                size="sm"
                onClick={() => void onSave()}
                disabled={!unsavedChecked.length || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar ({unsavedChecked.length})
              </Button>
            </div>
          </div>

          {st.lastDuplicates.length > 0 && (
            <p className="mb-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Já existiam: {st.lastDuplicates.slice(0, 8).join(", ")}
              {st.lastDuplicates.length > 8 ? ` e mais ${st.lastDuplicates.length - 8}` : ""}.
            </p>
          )}

          {running && !results.length && (
            <div className="space-y-3 py-4" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex gap-3 px-2">
                  <div className="h-4 w-4 animate-pulse rounded bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!running &&
            !results.length &&
            (searched ? (
              <EmptyState
                icon={SearchX}
                title="Nenhuma empresa encontrada"
                description="Tente um segmento mais comum, remova a cidade ou escolha outro estado."
              />
            ) : (
              <EmptyState
                icon={MapPin}
                title="Comece uma busca"
                description="Escolha um segmento e um local para ver empresas reais no mapa."
              />
            ))}
          {!!results.length && !filtered.length && (
            <EmptyState
              title="Nenhum resultado com esses filtros"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => searchStore.set({ filter: "", contactFilters: [], page: 1 })}
                >
                  Limpar filtros
                </Button>
              }
            />
          )}

          <ul className="divide-y divide-border">
            {pageItems.map((r) => (
              <ResultRow
                key={r.source_id}
                r={r}
                isSaved={r.source_id in saved}
                isChecked={checked.has(r.source_id)}
                isSelected={selected === r.source_id}
                onAddToCollection={onAddToCollection}
              />
            ))}
          </ul>
          <Pager
            page={page}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onChange={(p) => searchStore.set({ page: p })}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <div className="card-surface h-[300px] overflow-hidden p-1 sm:h-[420px]">
            <LazyLeadMap points={points} selectedId={selected} onSelect={selectResult} />
          </div>
          {sel && (
            <div className="card-surface space-y-3 p-5 text-sm animate-pop-in">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-bold">{sel.name}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="-mr-2 -mt-1 h-8 w-8"
                  onClick={() => selectResult(null)}
                  aria-label="Fechar detalhes"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-marker" />
                <span>
                  {sel.address ?? NOT_VERIFIED}
                  {sel.city ? `, ${sel.city}` : ""}
                  {sel.state ? ` - ${sel.state}` : ""}
                </span>
              </p>
              <ContactLinks c={sel} />
              <p className="text-xs text-muted-foreground">
                Fonte: {sel.provider} ({sel.source_id}) · consultado em{" "}
                {new Date(sel.verified_at).toLocaleString("pt-BR")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setCollectionTarget([sel])}>
                  <FolderPlus className="h-4 w-4" />
                  Adicionar à coleção
                </Button>
                {sel.lat != null && sel.lng != null && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={`https://www.openstreetmap.org/directions?to=${sel.lat}%2C${sel.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Navigation className="h-4 w-4" />
                      Abrir rota
                    </a>
                  </Button>
                )}
                {saved[sel.source_id] && (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/leads/$id" params={{ id: saved[sel.source_id]! }}>
                      Ver lead salvo
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Dados © colaboradores do OpenStreetMap, licença ODbL. Mapa: OpenFreeMap.
      </p>

      <AddToCollectionModal
        open={!!collectionTarget}
        onOpenChange={(o) => !o && setCollectionTarget(null)}
        count={collectionTarget?.length ?? 0}
        subject={collectionTarget?.length === 1 ? collectionTarget[0]!.name : undefined}
        onConfirm={addTargetToCollection}
      />
    </>
  );
}
