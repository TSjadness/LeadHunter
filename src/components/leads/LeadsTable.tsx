// Reusable server-paginated leads table (used by "Meus leads" and collection details).
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Users } from "lucide-react";
import type { Lead, LeadSort } from "@/lib/leads-api";
import { sourceLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, PriorityBadge, RowsSkeleton, StatusBadge } from "@/components/common";

type Props = {
  rows: Lead[];
  loading: boolean;
  checked: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  sort: LeadSort;
  dir: "asc" | "desc";
  onSort: (s: LeadSort) => void;
  empty?: React.ReactNode;
  rowActions?: (l: Lead) => React.ReactNode;
};

function SortHeader({
  id,
  label,
  sort,
  dir,
  onSort,
  className,
}: {
  id: LeadSort;
  label: string;
  sort: LeadSort;
  dir: "asc" | "desc";
  onSort: (s: LeadSort) => void;
  className?: string;
}) {
  const active = sort === id;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn("p-2", className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(id)}
        className="inline-flex items-center gap-1 rounded uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon className={cn("h-3 w-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}

export function LeadsTable({
  rows,
  loading,
  checked,
  onToggle,
  onToggleAll,
  sort,
  dir,
  onSort,
  empty,
  rowActions,
}: Props) {
  const allOn = rows.length > 0 && rows.every((r) => checked.has(r.id));
  if (loading && !rows.length) return <RowsSkeleton rows={8} className="py-4" />;
  if (!rows.length)
    return <>{empty ?? <EmptyState icon={Users} title="Nenhum lead encontrado" />}</>;
  return (
    <>
      {/* Phone: stacked cards */}
      <ul
        className={cn(
          "divide-y divide-border md:hidden",
          loading && "opacity-60 transition-opacity",
        )}
      >
        {rows.map((l) => (
          <li key={l.id} className="flex items-start gap-3 py-3">
            <Checkbox
              checked={checked.has(l.id)}
              onCheckedChange={() => onToggle(l.id)}
              className="mt-1"
              aria-label={`Selecionar ${l.name}`}
            />
            <div className="min-w-0 flex-1">
              <Link
                to="/leads/$id"
                params={{ id: l.id }}
                className="font-semibold hover:text-primary"
              >
                {l.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {[l.city && `${l.city}${l.state ? `/${l.state}` : ""}`, l.phone, l.niche]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <StatusBadge status={l.status} />
                <PriorityBadge priority={l.priority} compact />
                <span className="text-[11px] text-muted-foreground">{sourceLabel(l.source)}</span>
              </div>
            </div>
            {rowActions?.(l)}
          </li>
        ))}
      </ul>
      {/* Tablet/desktop: table */}
      <div
        className={cn(
          "hidden overflow-x-auto md:block",
          loading && "opacity-60 transition-opacity",
        )}
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="w-8 p-2">
                <Checkbox
                  checked={allOn}
                  onCheckedChange={(v) =>
                    onToggleAll(
                      rows.map((r) => r.id),
                      !!v,
                    )
                  }
                  aria-label="Selecionar todos desta página"
                />
              </th>
              <SortHeader id="name" label="Nome" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader id="city" label="Cidade" sort={sort} dir={dir} onSort={onSort} />
              <th className="p-2 uppercase">Telefone</th>
              <SortHeader
                id="status_changed_at"
                label="Status"
                sort={sort}
                dir={dir}
                onSort={onSort}
              />
              <SortHeader id="priority" label="Prioridade" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader
                id="created_at"
                label="Criado"
                sort={sort}
                dir={dir}
                onSort={onSort}
                className="hidden lg:table-cell"
              />
              <th className="hidden p-2 uppercase xl:table-cell">Origem</th>
              {rowActions && (
                <th className="w-10 p-2">
                  <span className="sr-only">Ações</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr
                key={l.id}
                className={cn(
                  "border-b border-border/70 transition-colors hover:bg-muted/50",
                  checked.has(l.id) && "bg-accent/40",
                )}
              >
                <td className="p-2">
                  <Checkbox
                    checked={checked.has(l.id)}
                    onCheckedChange={() => onToggle(l.id)}
                    aria-label={`Selecionar ${l.name}`}
                  />
                </td>
                <td className="max-w-72 p-2 font-medium">
                  <Link
                    to="/leads/$id"
                    params={{ id: l.id }}
                    className="block truncate hover:text-primary hover:underline"
                  >
                    {l.name}
                  </Link>
                  {l.niche && (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {l.niche}
                    </span>
                  )}
                </td>
                <td className="p-2">
                  {l.city ? (
                    `${l.city}${l.state ? `/${l.state}` : ""}`
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap p-2">
                  {l.phone ?? <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-2">
                  <StatusBadge status={l.status} />
                </td>
                <td className="p-2">
                  <PriorityBadge priority={l.priority} />
                </td>
                <td className="hidden whitespace-nowrap p-2 text-xs text-muted-foreground lg:table-cell">
                  {new Date(l.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="hidden p-2 text-xs text-muted-foreground xl:table-cell">
                  {sourceLabel(l.source)}
                </td>
                {rowActions && <td className="p-2">{rowActions(l)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
