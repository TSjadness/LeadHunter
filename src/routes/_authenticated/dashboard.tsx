import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, LayoutDashboard, Percent, Phone, Search, Trophy, Users } from "lucide-react";
import { dashboardQuery } from "@/lib/leads-api";
import { LEAD_STATUSES, sourceLabel } from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, StatCardSkeleton } from "@/components/common";
import { WeeklyWinsChart } from "@/components/dashboard/WeeklyWinsChart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LeadHunter" },
      { name: "description", content: "Visão geral dos seus leads." },
    ],
  }),
  component: Dashboard,
});

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function Dashboard() {
  const { data: d, isLoading, error } = useQuery(dashboardQuery);

  const header = (
    <PageHeader
      icon={LayoutDashboard}
      title="Dashboard"
      subtitle="Métricas calculadas no servidor a partir dos seus leads"
      actions={
        <Button asChild>
          <Link to="/busca">
            <Search className="h-4 w-4" />
            Pesquisar leads
          </Link>
        </Button>
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </>
    );
  }
  if (error || !d)
    return (
      <>
        {header}
        <EmptyState
          title="Não foi possível carregar o dashboard"
          description={userMessage(error)}
        />
      </>
    );
  if (!d.total) {
    return (
      <>
        {header}
        <div className="card-surface">
          <EmptyState
            icon={Users}
            title="Seu funil está vazio"
            description="Pesquise empresas por segmento e localização, salve as que interessam e acompanhe aqui a evolução."
            action={
              <>
                <Button asChild>
                  <Link to="/busca">Fazer a primeira busca</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/importar">Importar planilha</Link>
                </Button>
              </>
            }
          />
        </div>
      </>
    );
  }

  const by = (s: string) => d.by_status[s] ?? 0;
  const won = by("ganho");
  const lost = by("perdido");
  const closed = won + lost;
  const last4 = d.weekly.slice(-4).reduce((a, w) => a + w.won, 0);
  const contacted = d.total - by("novo");

  const cards = [
    {
      label: "Total de leads",
      value: d.total.toLocaleString("pt-BR"),
      hint: `${pct(contacted, d.total)}% já contatados`,
      icon: Users,
    },
    {
      label: "Ganhos (últimas 4 semanas)",
      value: last4.toLocaleString("pt-BR"),
      hint: `${won} ganho(s) no total`,
      icon: Trophy,
    },
    {
      label: "Taxa de conversão",
      value: `${pct(won, closed)}%`,
      hint: closed
        ? `ganhos ÷ (ganhos + perdidos) de ${closed} encerrados`
        : "nenhum lead encerrado ainda",
      icon: Percent,
    },
    {
      label: "Em negociação",
      value: by("negociacao").toLocaleString("pt-BR"),
      hint: `${by("contato")} em contato`,
      icon: FolderKanban,
    },
  ];
  const maxStatus = Math.max(1, ...LEAD_STATUSES.map((s) => by(s.id)));
  const coverage = [
    { label: "Telefone", n: d.with_phone, icon: Phone },
    { label: "E-mail", n: d.with_email },
    { label: "Site", n: d.with_website },
  ];

  return (
    <>
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => (
          <div
            key={c.label}
            className="card-surface card-interactive p-5 animate-page-in"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {c.label}
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-foreground">
                <c.icon className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 font-display text-3xl font-bold tabular-nums">{c.value}</div>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card-surface p-5 lg:col-span-2">
          <WeeklyWinsChart weekly={d.weekly} />
        </div>
        <div className="card-surface p-5">
          <h3 className="mb-4 font-semibold">Funil por status</h3>
          <ul className="space-y-3" aria-label="Quantidade de leads por status">
            {LEAD_STATUSES.map((s) => {
              const n = by(s.id);
              return (
                <li key={s.id}>
                  <Link
                    to="/leads"
                    search={{ status: s.id }}
                    className="group block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-muted-foreground group-hover:text-foreground">
                        {s.label}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {n}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({pct(n, d.total)}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-[width] duration-700 ease-out"
                        style={{
                          width: `${(n / maxStatus) * 100}%`,
                          backgroundColor: "var(--chart-bar)",
                        }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="card-surface p-5">
          <h3 className="mb-3 font-semibold">Principais cidades</h3>
          {d.top_cities.length ? (
            d.top_cities.map((c) => (
              <div
                key={`${c.city}-${c.state}`}
                className="flex justify-between border-b border-border py-2 text-sm last:border-0"
              >
                <span className="truncate">
                  {c.city}
                  {c.state ? `/${c.state}` : ""}
                </span>
                <b className="tabular-nums">{c.count}</b>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum lead com cidade.</p>
          )}
        </div>
        <div className="card-surface p-5">
          <h3 className="mb-3 font-semibold">Origem</h3>
          {Object.entries(d.by_source)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between border-b border-border py-2 text-sm last:border-0"
              >
                <span>{sourceLabel(k)}</span>
                <b className="tabular-nums">{v}</b>
              </div>
            ))}
        </div>
        <div className="card-surface p-5">
          <h3 className="mb-3 font-semibold">Qualidade dos contatos</h3>
          <ul className="space-y-3">
            {coverage.map((c) => (
              <li key={c.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Com {c.label.toLowerCase()}</span>
                  <span className="font-semibold tabular-nums">{pct(c.n, d.total)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct(c.n, d.total)}%`, backgroundColor: "var(--chart-bar)" }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
