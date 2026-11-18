import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Check, FolderPlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  addToCollection,
  collectionsQuery,
  createCollection,
  invalidateCollectionViews,
} from "@/lib/leads-api";
import { userMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Popover to add one or more leads to an existing or new collection. */
export function CollectionPicker({
  leadIds,
  memberOf = [],
  size = "sm",
  label = "Adicionar à coleção",
  onDone,
}: {
  leadIds: string[];
  memberOf?: string[];
  size?: "sm" | "default";
  label?: string;
  onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: cols, isLoading } = useQuery({ ...collectionsQuery, enabled: open });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const add = async (collectionId: string, colName: string) => {
    setBusy(collectionId);
    try {
      await addToCollection(collectionId, leadIds);
      await invalidateCollectionViews(qc);
      toast.success(`${leadIds.length} lead(s) adicionados a “${colName}”`);
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("new");
    try {
      const c = await createCollection(name);
      if (!c) throw new Error("Não foi possível criar a coleção.");
      setName("");
      await add(c.id, c.name);
    } catch (err) {
      toast.error(userMessage(err));
      setBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size={size} variant="outline" disabled={!leadIds.length}>
          <FolderPlus className="h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold text-muted-foreground">Coleções</p>
        <div className="max-h-56 overflow-y-auto">
          {isLoading && <Loader2 className="mx-auto my-3 h-4 w-4 animate-spin" />}
          {cols?.map((c) => {
            const isMember = memberOf.includes(c.id);
            return (
              <button
                key={c.id}
                disabled={!!busy || isMember}
                onClick={() => void add(c.id, c.name)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
              >
                <span className="truncate">{c.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {busy === c.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isMember ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    c.lead_count
                  )}
                </span>
              </button>
            );
          })}
          {cols && !cols.length && (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nenhuma coleção ainda.</p>
          )}
        </div>
        <form onSubmit={create} className="mt-2 flex gap-1 border-t border-border pt-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nova coleção"
            className="h-8"
            maxLength={120}
            aria-label="Nome da nova coleção"
          />
          <Button
            type="submit"
            size="icon"
            className="h-8 w-8 shrink-0"
            disabled={!name.trim() || !!busy}
            aria-label="Criar coleção"
          >
            {busy === "new" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
