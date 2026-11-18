import { LEAD_STATUSES } from "./constants";

/** Tailwind classes for each status tone (light/dark aware). */
const TONES: Record<string, string> = {
  slate: "bg-slate-500/12 text-slate-700 ring-slate-500/25 dark:text-slate-300",
  sky: "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:text-sky-300",
  amber: "bg-amber-500/15 text-amber-800 ring-amber-500/30 dark:text-amber-300",
  emerald: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  rose: "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
};

export const statusTone = (s: string) =>
  TONES[LEAD_STATUSES.find((x) => x.id === s)?.tone ?? "slate"]!;
