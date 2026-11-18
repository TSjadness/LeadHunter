import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FolderHeart, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  collectionsQuery,
  deleteCollection,
  invalidateCollectionViews,
  type CollectionWithCount,
} from "@/lib/leads-api";
import { CollectionDialog } from "@/components/collections/CollectionDialog";
import { userMessage } from "@/lib/errors";
import { PageHeader } from "@/components/AppShell";
import { ConfirmDialog, EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/colecoes/")({
  head: () => ({
    meta: [
      { title: "Coleções — LeadHunter" },
      { name: "description", content: "Organize leads em listas." },
    ],
  }),
  component: Colecoes,
});

function Colecoes() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(collectionsQuery);
  const [editing, setEditing] = useState<CollectionWithCount | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<CollectionWithCount | null>(null);

  const remove = async () => {
    if (!removing) return;
    try {
      await deleteCollection(removing.id);
      await invalidateCollectionViews(qc);
      toast.success("Coleção excluída", {
        description: "Os leads continuam salvos em Meus leads.",
      });
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        icon={FolderHeart}
        title="Coleções"
        subtitle="Listas para organizar seus leads"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Nova coleção
          </Button>
        }
      />
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}
      {error && (
        <EmptyState
          title="Não foi possível carregar as coleções"
          description={userMessage(error)}
        />
      )}
      {data && !data.length && (
        <div className="card-surface">
          <EmptyState
            icon={FolderHeart}
            title="Nenhuma coleção ainda"
            description="Crie uma coleção e adicione leads a partir de Meus leads, da página do lead ou da busca."
            action={<Button onClick={() => setCreating(true)}>Criar coleção</Button>}
          />
        </div>
      )}
      {!!data?.length && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c, i) => (
            <li
              key={c.id}
              className="card-surface card-interactive relative animate-page-in"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <Link
                to="/colecoes/$id"
                params={{ id: c.id }}
                className="block rounded-xl p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start gap-3 pr-8">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <FolderHeart className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{c.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      {c.lead_count} lead{c.lead_count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {c.description && (
                  <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                )}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-2 top-2 h-8 w-8"
                    aria-label={`Opções de ${c.name}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditing(c)}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setRemoving(c)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}
      {creating && <CollectionDialog open={creating} onOpenChange={setCreating} />}
      {editing && (
        <CollectionDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Excluir “${removing?.name}”?`}
        description="Apenas a coleção é removida. Os leads continuam em Meus leads."
        confirmLabel="Excluir coleção"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
