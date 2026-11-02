import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteLead, leadsQuery, saveLeads } from "@/lib/leads-api";
import { LEAD_STATUSES, PAGE_SIZE, statusLabel } from "@/lib/constants";
import { PageHeader } from "@/components/AppShell";
import { Pager } from "@/components/Pager";
import { AddToCollection } from "@/components/AddToCollection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/leads/")({
  head: () => ({ meta: [{ title: "Meus leads — LeadHunter" }, { name: "description", content: "Lista de leads salvos." }, { property: "og:title", content: "Meus leads — LeadHunter" }, { property: "og:description", content: "Lista de leads salvos." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsQuery),
  component: LeadsPage,
});

function LeadsPage() {
  const { data: leads } = useSuspenseQuery(leadsQuery);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");

  const filtered = useMemo(() => leads.filter((l) => (status === "all" || l.status === status) && (!q || `${l.name} ${l.city ?? ""} ${l.niche ?? ""} ${l.cnpj ?? ""}`.toLowerCase().includes(q.toLowerCase()))), [leads, q, status]);
  const items = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const add = async () => {
    if (!newName.trim()) return;
    const r = await saveLeads([{ name: newName.trim(), source: "manual" }]);
    if (r.conflicts.length) toast.warning("Lead já existe"); else toast.success("Lead criado");
    setNewName(""); qc.invalidateQueries();
  };
  const remove = async (id: string) => { if (!confirm("Excluir este lead?")) return; await deleteLead(id); qc.invalidateQueries(); };

  return (
    <>
      <PageHeader title="Meus leads" subtitle={`${leads.length} leads salvos`} actions={
        <div className="flex gap-2"><Input placeholder="Nome do novo lead" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} className="h-9 w-48" /><Button size="sm" onClick={add}><Plus className="h-4 w-4" />Adicionar</Button></div>
      } />
      <div className="card-surface p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Input placeholder="Buscar por nome, cidade, nicho, CNPJ" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="h-9 max-w-xs" />
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}><SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos status</SelectItem>{LEAD_STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent></Select>
          <div className="ml-auto"><AddToCollection disabled={!checked.size} getLeadIds={async () => [...checked]} label={`Coleção (${checked.size})`} /></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="w-8 p-2" /><th className="p-2">Nome</th><th className="p-2">Cidade</th><th className="p-2">Telefone</th><th className="p-2">Status</th><th className="p-2">Origem</th><th /></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/50">
                  <td className="p-2"><Checkbox checked={checked.has(l.id)} onCheckedChange={() => setChecked((s) => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })} /></td>
                  <td className="p-2 font-medium"><Link to="/leads/$id" params={{ id: l.id }} className="hover:text-primary hover:underline">{l.name}</Link></td>
                  <td className="p-2">{l.city ? `${l.city}/${l.state ?? ""}` : "—"}</td>
                  <td className="p-2">{l.phone ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2"><Badge variant="secondary">{statusLabel(l.status)}</Badge></td>
                  <td className="p-2 text-xs text-muted-foreground">{l.source === "osm" ? "OpenStreetMap" : l.source}</td>
                  <td className="p-2"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(l.id)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!items.length && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum lead encontrado.</p>}
        </div>
        <Pager page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </>
  );
}
