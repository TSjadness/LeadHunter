import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, FolderHeart, FolderMinus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import {
  collectionQuery,
  collectionsQuery,
  leadsListQuery,
  removeFromCollection,
  type LeadSort,
} from "@/lib/leads-api";
import { LEADS_PAGE_SIZE } from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { PageHeader } from "@/components/AppShell";
import { EmptyState, Pager } from "@/components/common";
import { CollectionDialog } from "@/components/collections/CollectionDialog";
import { BulkActions } from "@/components/leads/BulkActions";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/colecoes/$id")({
  head: () => ({ meta: [{ title: "Coleção — LeadHunter" }] }),
  component: ColecaoDetalhe,
});

function ColecaoDetalhe() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: col, isLoading } = useQuery(collectionQuery(id));
  const { data: all } = useQuery(collectionsQuery);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<LeadSort>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const list = useQuery(leadsListQuery({ page, collectionId: id, q, sort, dir }));

  if (isLoading) return <Skeleton className="h-40" />;
  if (!col) {
    return (
      <EmptyState
        icon={FolderHeart}
        title="Coleção não encontrada"
        action={
          <Button asChild variant="outline">
            <Link to="/colecoes">Voltar para Coleções</Link>
          </Button>
        }
      />
    );
  }
  const withCount = all?.find((c) => c.id === id) ?? { ...col, lead_count: list.data?.total ?? 0 };

  const removeSelected = async () => {
    try {
      await removeFromCollection(id, [...checked]);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["collections"] });
      toast.success(`${checked.size} lead(s) removidos da coleção`);
      setChecked(new Set());
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  return (
    <>
      <Link
        to="/colecoes"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Coleções
      </Link>
      <PageHeader
        icon={FolderHeart}
        title={col.name}
        subtitle={col.description || `${list.data?.total ?? withCount.lead_count} lead(s)`}
        actions={
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
        }
      />
      <div className="card-surface p-3 sm:p-4">
        <div className="mb-3 relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar nesta coleção"
            className="h-9 pl-8"
            aria-label="Buscar nesta coleção"
          />
        </div>
        <LeadsTable
          rows={list.data?.rows ?? []}
          loading={list.isLoading || list.isFetching}
          checked={checked}
          onToggle={(lid) =>
            setChecked((c) => {
              const n = new Set(c);
              if (n.has(lid)) n.delete(lid);
              else n.add(lid);
              return n;
            })
          }
          onToggleAll={(ids, on) =>
            setChecked((c) => {
              const n = new Set(c);
              ids.forEach((x) => (on ? n.add(x) : n.delete(x)));
              return n;
            })
          }
          sort={sort}
          dir={dir}
          onSort={(s) => {
            setDir(sort === s ? (dir === "asc" ? "desc" : "asc") : "asc");
            setSort(s);
          }}
          empty={
            <EmptyState
              icon={FolderHeart}
              title={q ? "Nenhum lead encontrado" : "Coleção vazia"}
              description={
                q
                  ? undefined
                  : "Em Meus leads, selecione leads e use “Coleção” para adicioná-los aqui."
              }
              action={
                !q && (
                  <Button asChild variant="outline">
                    <Link to="/leads">Ir para Meus leads</Link>
                  </Button>
                )
              }
            />
          }
        />
        {list.data && (
          <Pager
            page={page}
            total={list.data.total}
            pageSize={LEADS_PAGE_SIZE}
            onChange={setPage}
            loading={list.isFetching}
          />
        )}
      </div>
      <BulkActions
        ids={[...checked]}
        onClear={() => setChecked(new Set())}
        extra={
          <Button size="sm" variant="outline" onClick={() => void removeSelected()}>
            <FolderMinus className="h-4 w-4" />
            Remover da coleção
          </Button>
        }
      />
      {editing && <CollectionDialog open={editing} onOpenChange={setEditing} initial={withCount} />}
    </>
  );
}
