import { useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, CircleSlash, Loader2, XCircle } from "lucide-react";
import type { ProviderStatus } from "@/lib/search.functions";
import { cn } from "@/lib/utils";

export type ProviderRow = Omit<ProviderStatus, "status"> & {
  status: ProviderStatus["status"] | "running";
};

const ICON = {
  running: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  ok: <CheckCircle2 className="h-4 w-4 text-success" />,
  empty: <CircleDashed className="h-4 w-4 text-muted-foreground" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
  skipped: <CircleSlash className="h-4 w-4 text-muted-foreground" />,
};

const TEXT = {
  running: "consultando…",
  empty: "nenhum resultado",
  error: "falhou",
  skipped: "não usado",
};

/** Seconds since `startedAt`, ticking only inside this component (the page doesn't re-render). */
function useElapsed(startedAt: number | null, finishedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt == null || finishedAt != null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt, finishedAt]);
  if (startedAt == null) return null;
  return Math.max(0, Math.round(((finishedAt ?? now) - startedAt) / 1000));
}

export function ProviderProgress({
  rows,
  startedAt,
  finishedAt,
  note,
}: {
  rows: ProviderRow[];
  startedAt: number | null;
  finishedAt: number | null;
  note?: React.ReactNode;
}) {
  const elapsed = useElapsed(startedAt, finishedAt);
  if (!rows.length) return null;
  const done = rows.filter((r) => r.status !== "running").length;
  const pct = Math.round((done / rows.length) * 100);
  const running = done < rows.length;
  return (
    <div className="card-surface mt-3 p-4 animate-pop-in" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {running ? "Consultando fontes" : "Consulta concluída"} · {done}/{rows.length}
        </span>
        {elapsed != null && <span className="tabular-nums">{elapsed}s</span>}
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full bg-gold transition-[width] duration-500 ease-out",
            running && "animate-pulse",
          )}
          style={{ width: `${Math.max(pct, running ? 8 : 0)}%` }}
        />
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="flex min-w-0 items-start gap-2 text-sm">
            <span className="mt-0.5">{ICON[r.status]}</span>
            <span className="min-w-0">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground">
                {" "}
                — {r.status === "ok" ? `${r.count} resultado(s)` : TEXT[r.status]}
                {r.message ? ` (${r.message})` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {running && elapsed != null && elapsed >= 12 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Os servidores públicos do OpenStreetMap podem levar até um minuto em horários de pico.
          Você pode continuar navegando nos resultados que já chegaram — ou em outras páginas: a
          busca continua e os resultados ficam aqui quando você voltar.
        </p>
      )}
      {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
