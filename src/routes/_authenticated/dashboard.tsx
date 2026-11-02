import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Users, Phone, Trophy, FolderKanban, Search } from "lucide-react";
import { collectionsQuery, leadsQuery } from "@/lib/leads-api";
import { LEAD_STATUSES } from "@/lib/constants";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — LeadHunter" }, { name: "description", content: "Visão geral dos seus leads." }, { property: "og:title", content: "Dashboard — LeadHunter" }, { property: "og:description", content: "Visão geral dos seus leads." }] }),
  loader: ({ context }) => Promise.all([context.queryClient.ensureQueryData(leadsQuery), context.queryClient.ensureQueryData(collectionsQuery)]),
  component: Dashboard,
});

function Dashboard() {
  const { data: leads } = useSuspenseQuery(leadsQuery);
  const { data: cols } = useSuspenseQuery(collectionsQuery);
  const withPhone = leads.filter((l) => l.phone).length;
  const won = leads.filter((l) => l.status === "ganho").length;
  const conv = leads.length ? Math.round((won / leads.length) * 100) : 0;
  const bySource = Object.entries(leads.reduce<Record<string, number>>((a, l) => ((a[l.source] = (a[l.source] ?? 0) + 1), a), {}));
  const byCity = Object.entries(leads.reduce<Record<string, number>>((a, l) => { const k = l.city ? `${l.city}/${l.state ?? ""}` : "Sem cidade"; a[k] = (a[k] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...LEAD_STATUSES.map((s) => leads.filter((l) => l.status === s.id).length));

  const cards = [
    { label: "Total de leads", value: leads.length, icon: Users },
    { label: "Com telefone", value: withPhone, icon: Phone },
    { label: "Ganhos", value: `${won} (${conv}%)`, icon: Trophy },
    { label: "Coleções", value: cols.length, icon: FolderKanban },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Métricas calculadas a partir dos seus leads salvos" actions={<Button asChild><Link to="/busca"><Search className="h-4 w-4" />Pesquisar leads</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="card-surface p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">{c.label}<c.icon className="h-5 w-5 text-primary" /></div>
            <div className="mt-2 font-display text-3xl font-bold">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="card-surface p-5 lg:col-span-2">
          <h3 className="mb-4 font-semibold">Funil por status</h3>
          <div className="space-y-3">
            {LEAD_STATUSES.map((s) => { const n = leads.filter((l) => l.status === s.id).length; return (
              <div key={s.id} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">{s.label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gold" style={{ width: `${(n / max) * 100}%` }} /></div>
                <span className="w-8 text-right font-semibold">{n}</span>
              </div>); })}
          </div>
        </div>
        <div className="card-surface p-5">
          <h3 className="mb-3 font-semibold">Principais cidades</h3>
          {byCity.length ? byCity.map(([k, v]) => <div key={k} className="flex justify-between border-b border-border py-2 text-sm last:border-0"><span>{k}</span><b>{v}</b></div>) : <p className="text-sm text-muted-foreground">Nenhum lead ainda.</p>}
          <h3 className="mb-2 mt-5 font-semibold">Origem</h3>
          {bySource.map(([k, v]) => <div key={k} className="flex justify-between py-1 text-sm"><span>{k === "osm" ? "OpenStreetMap" : k}</span><b>{v}</b></div>)}
        </div>
      </div>
    </>
  );
}
