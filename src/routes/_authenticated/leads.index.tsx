import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ChevronDown, Loader2, Phone, Plus, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { leadsListQuery, type LeadSort } from "@/lib/leads-api";
import { saveLeads } from "@/lib/leads.functions";
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  LEADS_PAGE_SIZE,
  type LeadPriority,
} from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, Field, Pager, PriorityBadge, StatusBadge } from "@/components/common";
import { BulkActions } from "@/components/leads/BulkActions";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const searchSchema = z.object({
  page: z.number().int().min(1).catch(1).optional(),
  q: z.string().max(80).catch("").optional(),
  status: z.string().max(80).catch("").optional(),
  /** Comma-separated 1–3. */
  priority: z.string().max(10).catch("").optional(),
  city: z.string().max(80).catch("").optional(),
  phone: z.boolean().catch(false).optional(),
  sort: z
    .enum(["created_at", "name", "city", "status_changed_at", "updated_at", "priority"])
    .catch("created_at")
    .optional(),
  dir: z.enum(["asc", "desc"]).catch("desc").optional(),
});

export const Route = createFileRoute("/_authenticated/leads/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Meus leads — LeadHunter" },
      { name: "description", content: "Lista de leads salvos." },
    ],
  }),
  component: LeadsPage,
});

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function NewLeadDialog() {
  const qc = useQueryClient();
  const save = useServerFn(saveLeads);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", state: "", phone: "", niche: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await save({
        data: {
          items: [{ ...form, state: form.state.toUpperCase() || undefined, source: "manual" }],
        },
      });
      await qc.invalidateQueries({ queryKey: ["leads"] });
      if (r.inserted[0]) {
        toast.success("Lead criado");
        setOpen(false);
        setForm({ name: "", city: "", state: "", phone: "", niche: "" });
        navigate({ to: "/leads/$id", params: { id: r.inserted[0].id } });
      } else {
        const dup = r.duplicates[0];
        toast.warning("Esse lead já existe", {
          action: dup?.existingId
            ? {
                label: "Abrir",
                onClick: () => navigate({ to: "/leads/$id", params: { id: dup.existingId! } }),
              }
            : undefined,
        });
      }
    } catch (err) {
      toast.error(userMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const f = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Novo lead
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>
            Preencha o que você sabe. Os demais dados podem ser completados depois.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field id="nl-name" label="Nome *" className="sm:col-span-2">
            <Input id="nl-name" required maxLength={300} autoFocus {...f("name")} />
          </Field>
          <Field id="nl-niche" label="Segmento">
            <Input id="nl-niche" maxLength={120} {...f("niche")} />
          </Field>
          <Field id="nl-phone" label="Telefone">
            <Input id="nl-phone" type="tel" maxLength={40} {...f("phone")} />
          </Field>
          <Field id="nl-city" label="Cidade">
            <Input id="nl-city" maxLength={120} {...f("city")} />
          </Field>
          <Field id="nl-uf" label="UF">
            <Input id="nl-uf" maxLength={2} {...f("state")} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={busy || !form.name.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeadsPage() {
  const s = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const page = s.page ?? 1;
  const statuses = s.status ? s.status.split(",").filter(Boolean) : [];
  const priorities = (s.priority ?? "")
    .split(",")
    .map(Number)
    .filter((n): n is LeadPriority => n === 1 || n === 2 || n === 3);
  const sort = (s.sort ?? "created_at") as LeadSort;
  const dir = s.dir ?? (sort === "name" || sort === "city" ? "asc" : "desc");
  const [qInput, setQInput] = useState(s.q ?? "");
  const [cityInput, setCityInput] = useState(s.city ?? "");
  const q = useDebounced(qInput);
  const city = useDebounced(cityInput);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>, resetPage = true) =>
    navigate({
      search: (prev) => ({ ...prev, ...patch, ...(resetPage ? { page: 1 } : {}) }),
      replace: true,
    });

  useEffect(() => {
    if ((s.q ?? "") !== q || (s.city ?? "") !== city)
      setSearch({ q: q || undefined, city: city || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, city]);

  const filters = {
    page,
    q: s.q,
    statuses,
    priorities,
    city: s.city,
    hasPhone: s.phone,
    sort,
    dir,
  };
  const { data, isFetching, isLoading, error } = useQuery(leadsListQuery(filters));
  const anyFilter = !!(s.q || s.city || statuses.length || priorities.length || s.phone);

  const toggleStatus = (id: string) => {
    const next = statuses.includes(id) ? statuses.filter((x) => x !== id) : [...statuses, id];
    setSearch({ status: next.join(",") || undefined });
  };
  const togglePriority = (id: LeadPriority) => {
    const next = priorities.includes(id) ? priorities.filter((x) => x !== id) : [...priorities, id];
    setSearch({ priority: next.join(",") || undefined });
  };
  const onSort = (col: LeadSort) =>
    setSearch(
      {
        sort: col,
        dir:
          sort === col
            ? dir === "asc"
              ? "desc"
              : "asc"
            : col === "name" || col === "city"
              ? "asc"
              : "desc",
      },
      false,
    );

  return (
    <>
      <PageHeader
        icon={Users}
        title="Meus leads"
        subtitle={
          data
            ? `${data.total.toLocaleString("pt-BR")} lead(s)${anyFilter ? " com os filtros atuais" : " salvos"}`
            : "Carregando…"
        }
        actions={
          <>
            <Button asChild size="sm" variant="outline">
              <Link to="/busca">
                <Search className="h-4 w-4" />
                Pesquisar
              </Link>
            </Button>
            <NewLeadDialog />
          </>
        }
      />
      <div className="card-surface p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Nome, cidade, segmento, CNPJ ou telefone"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              className="h-9 pl-8"
              aria-label="Buscar leads"
            />
          </div>
          <Input
            placeholder="Cidade"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            className="h-9 w-full sm:w-40"
            aria-label="Filtrar por cidade"
          />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                {statuses.length ? `Status (${statuses.length})` : "Todos os status"}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 space-y-1 p-2" align="start">
              {LEAD_STATUSES.map((st) => (
                <label
                  key={st.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={statuses.includes(st.id)}
                    onCheckedChange={() => toggleStatus(st.id)}
                  />
                  <StatusBadge status={st.id} />
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                {priorities.length ? `Prioridade (${priorities.length})` : "Todas as prioridades"}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 space-y-1 p-2" align="start">
              {LEAD_PRIORITIES.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <Checkbox
                    checked={priorities.includes(p.id)}
                    onCheckedChange={() => togglePriority(p.id)}
                  />
                  <PriorityBadge priority={p.id} />
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <Button
            variant={s.phone ? "default" : "outline"}
            size="sm"
            className="h-9"
            aria-pressed={!!s.phone}
            onClick={() => setSearch({ phone: s.phone ? undefined : true })}
          >
            <Phone className="h-4 w-4" />
            Com telefone
          </Button>
          {anyFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setQInput("");
                setCityInput("");
                navigate({ search: {}, replace: true });
              }}
            >
              <X className="h-4 w-4" />
              Limpar
            </Button>
          )}
        </div>
        {error ? (
          <EmptyState title="Não foi possível carregar os leads" description={userMessage(error)} />
        ) : (
          <LeadsTable
            rows={data?.rows ?? []}
            loading={isLoading || isFetching}
            checked={checked}
            onToggle={(id) =>
              setChecked((c) => {
                const n = new Set(c);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            onToggleAll={(ids, on) =>
              setChecked((c) => {
                const n = new Set(c);
                ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
                return n;
              })
            }
            sort={sort}
            dir={dir}
            onSort={onSort}
            empty={
              anyFilter ? (
                <EmptyState
                  icon={Search}
                  title="Nenhum lead com esses filtros"
                  description="Ajuste a busca ou limpe os filtros."
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="Você ainda não tem leads"
                  description="Pesquise empresas por segmento e localização ou importe uma planilha."
                  action={
                    <>
                      <Button asChild>
                        <Link to="/busca">Pesquisar leads</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link to="/importar">Importar planilha</Link>
                      </Button>
                    </>
                  }
                />
              )
            }
          />
        )}
        {data && (
          <Pager
            page={page}
            total={data.total}
            pageSize={LEADS_PAGE_SIZE}
            onChange={(p) => setSearch({ page: p }, false)}
            loading={isFetching}
          />
        )}
      </div>
      <BulkActions ids={[...checked]} onClear={() => setChecked(new Set())} />
    </>
  );
}
