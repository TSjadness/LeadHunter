// Single-series column chart: leads moved to "Ganho" per week (the north-star metric).
// One hue (validated --chart-bar), 4px rounded tops anchored to the baseline, 2px gaps,
// recessive grid, hover/focus tooltip with a hit target taller than the bar, table view.
import { useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import type { Dashboard } from "@/lib/leads-api";
import { Button } from "@/components/ui/button";

const fmtWeek = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
};

export function WeeklyWinsChart({ weekly }: { weekly: Dashboard["weekly"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...weekly.map((w) => w.won));
  const ticks =
    max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const estimated = weekly.some((w) => w.won_estimated > 0);
  const total = weekly.reduce((a, w) => a + w.won, 0);
  const h = 180;

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Leads ganhos por semana</h3>
          <p className="text-xs text-muted-foreground">
            Últimas {weekly.length} semanas · {total} no total
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
          {table ? "Gráfico" : "Tabela"}
        </Button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Semana de</th>
                <th className="py-1 text-right">Ganhos</th>
                <th className="py-1 text-right">Novos leads</th>
              </tr>
            </thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.week} className="border-t border-border">
                  <td className="py-1">{fmtWeek(w.week)}</td>
                  <td className="py-1 text-right tabular-nums">
                    {w.won}
                    {w.won_estimated ? "*" : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">{w.created}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          <div
            className="relative flex w-6 flex-col-reverse justify-between text-right text-[10px] tabular-nums text-muted-foreground"
            style={{ height: h }}
            aria-hidden
          >
            {ticks.map((t) => (
              <span key={t} className="leading-none">
                {t}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <div
              className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between"
              style={{ height: h }}
              aria-hidden
            >
              {ticks.map((t) => (
                <div key={t} className="border-t border-border/60" />
              ))}
            </div>
            <div
              className="relative flex items-end gap-[2px]"
              style={{ height: h }}
              role="list"
              aria-label="Leads ganhos por semana"
            >
              {weekly.map((w, i) => {
                const pct = (w.won / max) * 100;
                return (
                  <div
                    key={w.week}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`Semana de ${fmtWeek(w.week)}: ${w.won} ganho(s)`}
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                  >
                    <div
                      className="w-full max-w-7 rounded-t-[4px] transition-[height,opacity] duration-500 ease-out"
                      style={{
                        height: `${w.won ? Math.max(pct, 2) : 0}%`,
                        backgroundColor: "var(--chart-bar)",
                        opacity: hover == null || hover === i ? 1 : 0.45,
                      }}
                    />
                    {hover === i && (
                      <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-elevated animate-pop-in">
                        <p className="font-semibold">Semana de {fmtWeek(w.week)}</p>
                        <p>
                          <span className="tabular-nums">{w.won}</span> ganho(s)
                          {w.won_estimated ? ` (${w.won_estimated} com data estimada)` : ""}
                        </p>
                        <p className="text-muted-foreground">{w.created} novo(s) lead(s)</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              className="mt-1 flex justify-between text-[10px] text-muted-foreground"
              aria-hidden
            >
              <span>{weekly[0] && fmtWeek(weekly[0].week)}</span>
              <span>{weekly.at(-1) && fmtWeek(weekly.at(-1)!.week)}</span>
            </div>
          </div>
        </div>
      )}
      {estimated && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          * Leads ganhos antes do histórico de status existir aparecem na data da última atualização
          (estimativa).
        </p>
      )}
    </div>
  );
}
