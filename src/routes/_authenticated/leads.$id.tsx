import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  History,
  Loader2,
  MessageSquarePlus,
  Save,
  SearchCheck,
  Sparkles,
  Trash2,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import {
  addInteraction,
  collectionsQuery,
  deleteInteraction,
  deleteLeads,
  interactionsQuery,
  leadCollectionsQuery,
  leadQuery,
  invalidateCollectionViews,
  removeFromCollection,
  statusEventsQuery,
  updateLead,
  type Lead,
} from "@/lib/leads-api";
import { lookupCnpj } from "@/lib/search.functions";
import {
  DEFAULT_PRIORITY,
  INTERACTION_KINDS,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  NOT_VERIFIED,
  sourceLabel,
  statusLabel,
} from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/lib/normalize";
import { PageHeader } from "@/components/AppShell";
import { ConfirmDialog, EmptyState, Field, PriorityBadge, StatusBadge } from "@/components/common";
import { ContactLinks } from "@/components/common/ContactLinks";
import { CollectionPicker } from "@/components/leads/CollectionPicker";
import { LazyLeadMap } from "@/components/LeadMap/Lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({
    meta: [
      { title: "Detalhes do lead — LeadHunter" },
      { name: "description", content: "Dados empresariais do lead." },
    ],
  }),
  component: LeadDetail,
});

type FormKey = Exclude<
  keyof Lead,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "name_key"
  | "status_changed_at"
  | "lat"
  | "lng"
  | "source"
  | "source_id"
  | "verified_at"
>;

const SECTIONS: { title: string; fields: [FormKey, string, string?][] }[] = [
  {
    title: "Empresa",
    fields: [
      ["name", "Nome"],
      ["trade_name", "Nome fantasia"],
      ["legal_name", "Razão social"],
      ["cnpj", "CNPJ"],
      ["cnae", "CNAE"],
      ["niche", "Segmento"],
    ],
  },
  {
    title: "Contato",
    fields: [
      ["phone", "Telefone", "tel"],
      ["whatsapp", "WhatsApp", "tel"],
      ["email", "E-mail", "email"],
      ["website", "Site", "url"],
      ["instagram", "Instagram"],
      ["facebook", "Facebook"],
      ["linkedin", "LinkedIn"],
    ],
  },
  {
    title: "Endereço",
    fields: [
      ["address", "Endereço"],
      ["city", "Cidade"],
      ["state", "UF"],
    ],
  },
  {
    title: "Comercial",
    fields: [
      ["revenue", "Faturamento (R$)", "number"],
      ["revenue_source", "Fonte do faturamento"],
    ],
  },
];

type TimelineItem = {
  id: string;
  at: string;
  kind: "interaction" | "status";
  title: string;
  body?: string;
  interactionId?: string;
  estimated?: boolean;
};

function LeadDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: lead, isLoading, error } = useQuery(leadQuery(id));
  const { data: interactions = [] } = useQuery(interactionsQuery(id));
  const { data: events = [] } = useQuery(statusEventsQuery(id));
  const { data: memberOf = [] } = useQuery(leadCollectionsQuery(id));
  const { data: allCollections = [] } = useQuery(collectionsQuery);
  const cnpjFn = useServerFn(lookupCnpj);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<string>("nota");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (lead && !dirty) setForm(lead);
  }, [lead, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const timeline = useMemo<TimelineItem[]>(() => {
    const a: TimelineItem[] = interactions.map((i) => ({
      id: `i${i.id}`,
      at: i.created_at,
      kind: "interaction",
      title: i.kind,
      body: i.content,
      interactionId: i.id,
    }));
    const b: TimelineItem[] = events.map((e) => ({
      id: `e${e.id}`,
      at: e.created_at,
      kind: "status",
      title: e.from_status
        ? `${statusLabel(e.from_status)} → ${statusLabel(e.to_status)}`
        : `Criado como ${statusLabel(e.to_status)}`,
      estimated: e.backfilled,
    }));
    return [...a, ...b].sort((x, y) => y.at.localeCompare(x.at));
  }, [interactions, events]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }
  if (error || !lead) {
    return (
      <EmptyState
        icon={UserX}
        title="Lead não encontrado"
        description={error ? userMessage(error) : "Ele pode ter sido excluído."}
        action={
          <Button asChild variant="outline">
            <Link to="/leads">Voltar para Meus leads</Link>
          </Button>
        }
      />
    );
  }

  const set = (k: keyof Lead, v: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: v === "" ? null : v }));
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["leads"] });

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {};
      for (const s of SECTIONS) for (const [k] of s.fields) patch[k] = form[k] ?? null;
      patch["status"] = form.status;
      patch["priority"] = form.priority ?? DEFAULT_PRIORITY;
      patch["notes"] = form.notes ?? null;
      patch["verified_at"] = form.verified_at ?? null;
      const updated = await updateLead(id, patch);
      setDirty(false);
      if (updated) setForm(updated);
      await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ["status-events", id] })]);
      toast.success("Lead atualizado");
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const cnpj = normalizeCnpj(form.cnpj ?? "") ?? "";
  const cnpjOk = isValidCnpj(cnpj);
  const enrich = async () => {
    if (!cnpjOk) return void toast.error("Informe um CNPJ válido (14 caracteres).");
    setBusy(true);
    try {
      const r = await cnpjFn({ data: { cnpj } });
      // Fill only empty fields; never overwrite what the user already has.
      setForm((f) => ({
        ...f,
        cnpj,
        legal_name: f.legal_name || r.legal_name,
        trade_name: f.trade_name || r.trade_name,
        cnae: f.cnae || r.cnae,
        address: f.address || r.address,
        city: f.city || r.city,
        state: f.state || r.state,
        phone: f.phone || r.phone,
        email: f.email || r.email,
        verified_at: new Date().toISOString(),
      }));
      setDirty(true);
      toast.success(`Receita Federal: ${r.situacao ?? "dados carregados"}`, {
        description: "Campos vazios foram preenchidos. Revise e clique em Salvar.",
      });
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try {
      await addInteraction(id, kind, note);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["interactions", id] });
      toast.success("Interação registrada");
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  const removeLead = async () => {
    try {
      await deleteLeads([id]);
      await refresh();
      toast.success("Lead excluído");
      navigate({ to: "/leads" });
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  const collections = allCollections.filter((c) => memberOf.includes(c.id));

  return (
    <>
      <Link
        to="/leads"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Meus leads
      </Link>
      <PageHeader
        title={lead.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status} />
            <PriorityBadge priority={lead.priority} />
            <span>
              Fonte:{" "}
              {lead.source === "osm"
                ? `OpenStreetMap (${lead.source_id})`
                : sourceLabel(lead.source)}{" "}
              · Verificado:{" "}
              {lead.verified_at ? new Date(lead.verified_at).toLocaleString("pt-BR") : "não"}
            </span>
          </span>
        }
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {dirty ? "Salvar alterações" : "Salvo"}
            </Button>
          </>
        }
      />

      {cnpjOk && !lead.legal_name && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-accent/60 p-3 text-sm animate-pop-in">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="flex-1">
            Este lead tem CNPJ. Consulte a Receita Federal para completar razão social, CNAE e
            endereço.
          </span>
          <Button size="sm" variant="outline" onClick={() => void enrich()} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SearchCheck className="h-4 w-4" />
            )}
            Enriquecer
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="card-surface p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 sm:max-w-xl">
              <Field id="f-status" label="Status">
                <Select value={form.status ?? "novo"} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger id="f-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="f-priority" label="Prioridade">
                <Select
                  value={String(form.priority ?? DEFAULT_PRIORITY)}
                  onValueChange={(v) => {
                    setDirty(true);
                    setForm((f) => ({ ...f, priority: Number(v) }));
                  }}
                >
                  <SelectTrigger id="f-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_PRIORITIES.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
          {SECTIONS.map((section) => (
            <fieldset key={section.title} className="card-surface p-4 sm:p-5">
              <legend className="sr-only">{section.title}</legend>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.fields.map(([k, label, type]) => (
                  <Field key={k} id={`f-${k}`} label={label}>
                    <div className="flex gap-1">
                      <Input
                        id={`f-${k}`}
                        value={
                          k === "cnpj" && form.cnpj && !dirty
                            ? formatCnpj(form.cnpj)
                            : ((form[k] as string | number | null) ?? "")
                        }
                        onChange={(e) => set(k, e.target.value)}
                        placeholder={k === "revenue" ? "Somente se documentado" : NOT_VERIFIED}
                        type={type ?? "text"}
                        inputMode={type === "number" ? "decimal" : undefined}
                        maxLength={k === "state" ? 2 : 500}
                      />
                      {k === "cnpj" && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => void enrich()}
                          disabled={busy || !cnpjOk}
                          title="Consultar CNPJ na BrasilAPI"
                          aria-label="Consultar CNPJ na BrasilAPI"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <SearchCheck className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </Field>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="card-surface p-4 sm:p-5">
            <Field id="f-notes" label="Notas">
              <Textarea
                id="f-notes"
                rows={4}
                maxLength={10000}
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-surface space-y-3 p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Contatos
            </h2>
            <ContactLinks c={lead} />
          </div>
          {lead.lat != null && lead.lng != null && (
            <div className="card-surface overflow-hidden p-1">
              <div className="h-56">
                <LazyLeadMap
                  points={[{ id: lead.id, name: lead.name, lat: lead.lat, lng: lead.lng }]}
                />
              </div>
              <Button asChild variant="ghost" size="sm" className="w-full">
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`https://www.openstreetmap.org/directions?to=${lead.lat}%2C${lead.lng}`}
                >
                  Abrir rota externa <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
          <div className="card-surface space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Coleções
              </h2>
              <CollectionPicker leadIds={[id]} memberOf={memberOf} label="Adicionar" />
            </div>
            {collections.length ? (
              <ul className="flex flex-wrap gap-2">
                {collections.map((c) => (
                  <li
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pl-3 pr-1 text-xs"
                  >
                    <Link
                      to="/colecoes/$id"
                      params={{ id: c.id }}
                      className="font-medium hover:text-primary"
                    >
                      {c.name}
                    </Link>
                    <button
                      className="grid h-5 w-5 place-items-center rounded-full hover:bg-background"
                      aria-label={`Remover de ${c.name}`}
                      onClick={async () => {
                        try {
                          await removeFromCollection(c.id, [id]);
                          await invalidateCollectionViews(qc);
                        } catch (e) {
                          toast.error(userMessage(e));
                        }
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Este lead não está em nenhuma coleção.
              </p>
            )}
          </div>
          <div className="card-surface space-y-3 p-4 sm:p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <History className="h-4 w-4" />
              Histórico
            </h2>
            <div className="flex gap-2">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger className="w-32" aria-label="Tipo de interação">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERACTION_KINDS.map((k) => (
                    <SelectItem key={k} value={k} className="capitalize">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="O que aconteceu?"
                maxLength={5000}
                onKeyDown={(e) => e.key === "Enter" && void addNote()}
                aria-label="Descrição da interação"
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => void addNote()}
              disabled={!note.trim()}
            >
              <MessageSquarePlus className="h-4 w-4" />
              Registrar interação
            </Button>
            <ol className="relative space-y-3 border-l border-border pl-4 text-sm">
              {timeline.map((t) => (
                <li key={t.id} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-card ${t.kind === "status" ? "bg-primary" : "bg-muted-foreground"}`}
                    aria-hidden
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium capitalize">{t.title}</p>
                      {t.body && (
                        <p className="whitespace-pre-wrap break-words text-muted-foreground">
                          {t.body}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.at).toLocaleString("pt-BR")}
                        {t.estimated ? " · data estimada (anterior ao histórico)" : ""}
                      </p>
                    </div>
                    {t.interactionId && (
                      <button
                        className="text-xs text-muted-foreground hover:text-destructive"
                        aria-label="Excluir interação"
                        onClick={async () => {
                          try {
                            await deleteInteraction(t.interactionId!);
                            await qc.invalidateQueries({ queryKey: ["interactions", id] });
                          } catch (e) {
                            toast.error(userMessage(e));
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {!timeline.length && (
                <li className="text-muted-foreground">Nenhuma interação ainda.</li>
              )}
            </ol>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir este lead?"
        description="O histórico, as interações e os vínculos com coleções também serão removidos."
        confirmLabel="Excluir"
        destructive
        onConfirm={removeLead}
      />
    </>
  );
}
