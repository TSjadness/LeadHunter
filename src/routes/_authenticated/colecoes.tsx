import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { collectionsQuery, createCollection, deleteCollection, leadsQuery, removeFromCollection } from "@/lib/leads-api";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/colecoes")({
  head: () => ({ meta: [{ title: "Coleções — LeadHunter" }, { name: "description", content: "Organize leads em coleções." }, { property: "og:title", content: "Coleções — LeadHunter" }, { property: "og:description", content: "Organize leads em coleções." }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(collectionsQuery), context.queryClient.ensureQueryData(leadsQuery)]),
  component: Colecoes,
});

function Colecoes() {
  const { data: cols } = useSuspenseQuery(collectionsQuery);
  const { data: leads } = useSuspenseQuery(leadsQuery);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(cols[0]?.id ?? null);
  const byId = new Map(leads.map((l) => [l.id, l]));

  const create = async () => {
    if (!name.trim()) return;
    try { const c = await createCollection(name); setName(""); setOpen(c.id); qc.invalidateQueries(); }
    catch (e) { toast.error(e instanceof Error && e.message.includes("duplicate") ? "Nome já existe" : "Erro ao criar"); }
  };
  const current = cols.find((c) => c.id === open);

  return (
    <>
      <PageHeader title="Coleções" subtitle="Um lead pode estar em várias coleções" actions={<div className="flex gap-2"><Input className="h-9 w-52" placeholder="Nova coleção" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} /><Button size="sm" onClick={create}><Plus className="h-4 w-4" />Adicionar</Button></div>} />
      <div className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="card-surface space-y-1 p-3">
          {cols.map((c) => (
            <button key={c.id} onClick={() => setOpen(c.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${open === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}>
              <span className="truncate">{c.name}</span><span className="text-xs text-muted-foreground">{c.collection_leads.length}</span>
            </button>
          ))}
          {!cols.length && <p className="p-2 text-sm text-muted-foreground">Crie sua primeira coleção.</p>}
        </div>
        <div className="card-surface p-5">
          {current ? (
            <>
              <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">{current.name}</h3>
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Excluir coleção? (os leads continuam salvos)")) { await deleteCollection(current.id); setOpen(null); qc.invalidateQueries(); } }}><Trash2 className="h-4 w-4" />Excluir</Button></div>
              <ul className="divide-y divide-border">
                {current.collection_leads.map(({ lead_id }) => { const l = byId.get(lead_id); if (!l) return null; return (
                  <li key={lead_id} className="flex items-center justify-between py-2 text-sm">
                    <Link to="/leads/$id" params={{ id: l.id }} className="hover:text-primary">{l.name} <span className="text-muted-foreground">· {l.city ?? "—"}</span></Link>
                    <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remover" onClick={async () => { await removeFromCollection(current.id, lead_id); qc.invalidateQueries(); }}><X className="h-4 w-4" /></Button>
                  </li>); })}
              </ul>
              {!current.collection_leads.length && <p className="text-sm text-muted-foreground">Adicione leads pelas páginas de busca ou de leads.</p>}
            </>
          ) : <p className="text-sm text-muted-foreground">Selecione uma coleção.</p>}
        </div>
      </div>
    </>
  );
}
