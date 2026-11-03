import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { leadsQuery, updateLead } from "@/lib/leads-api";
import { LEAD_STATUSES, PAGE_SIZE } from "@/lib/constants";
import { PageHeader } from "@/components/AppShell";
import { Pager } from "@/components/Pager";

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({ meta: [{ title: "Kanban — LeadHunter" }, { name: "description", content: "Funil de vendas em Kanban." }, { property: "og:title", content: "Kanban — LeadHunter" }, { property: "og:description", content: "Funil de vendas em Kanban." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsQuery),
  component: Kanban,
});

function Kanban() {
  const { data: leads } = useSuspenseQuery(leadsQuery);
  const qc = useQueryClient();
  const [pages, setPages] = useState<Record<string, number>>({});
  const [over, setOver] = useState<string | null>(null);

  const move = async (id: string, status: string) => {
    qc.setQueryData(leadsQuery.queryKey, (old) => old?.map((l) => (l.id === id ? { ...l, status } : l)));
    try { await updateLead(id, { status }); } catch { toast.error("Falha ao mover"); qc.invalidateQueries(); }
  };

  return (
    <>
      <PageHeader title="Kanban" subtitle="Arraste os cards entre colunas para mudar o status" />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_STATUSES.map((s) => {
          const col = leads.filter((l) => l.status === s.id);
          const p = pages[s.id] ?? 1;
          return (
            <div key={s.id}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, s.id); }}
              className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/60 p-3 transition-colors ${over === s.id ? "border-primary" : "border-border"}`}>
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{s.label}</h3><span className="rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground">{col.length}</span></div>
              <div className="min-h-24 flex-1 space-y-2">
                {col.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE).map((l) => (
                  <div key={l.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)} className="card-surface cursor-grab p-3 text-sm active:cursor-grabbing">
                    <Link to="/leads/$id" params={{ id: l.id }} className="font-medium hover:text-primary">{l.name}</Link>
                    <p className="text-xs text-muted-foreground">{l.city ?? "—"} {l.phone ? `· ${l.phone}` : ""}</p>
                  </div>
                ))}
              </div>
              <Pager page={p} total={col.length} pageSize={PAGE_SIZE} onChange={(n) => setPages((x) => ({ ...x, [s.id]: n }))} />
            </div>
          );
        })}
      </div>
    </>
  );
}
