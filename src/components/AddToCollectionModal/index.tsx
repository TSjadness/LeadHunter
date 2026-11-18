import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Check, FolderPlus, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { collectionsQuery, createCollection, type CollectionWithCount } from "@/lib/leads-api";
import { userMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import * as s from "./styles";

export type PickedCollection = Pick<CollectionWithCount, "id" | "name">;

/**
 * Modal to pick (or create) one collection. The caller performs the actual write in
 * `onConfirm`; the modal stays open and shows the error if it fails.
 */
export function AddToCollectionModal({
  open,
  onOpenChange,
  count,
  subject,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** How many leads will be added (for the copy). */
  count: number;
  /** Optional name when adding a single lead. */
  subject?: string | undefined;
  onConfirm: (c: PickedCollection) => Promise<void>;
}) {
  const qc = useQueryClient();
  const {
    data: cols,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    ...collectionsQuery,
    enabled: open,
  });
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [busy, setBusy] = useState<"create" | "confirm" | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setPicked(null);
    setCreating(false);
    setNewName("");
    setNewDesc("");
  }, [open]);

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (cols ?? []).filter(
      (c) => !t || c.name.toLowerCase().includes(t) || c.description?.toLowerCase().includes(t),
    );
  }, [cols, q]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy("create");
    try {
      const c = await createCollection(newName, newDesc || null);
      if (!c) throw new Error("Não foi possível criar a coleção.");
      await qc.invalidateQueries({ queryKey: ["collections"] });
      setPicked(c.id);
      setCreating(false);
      setNewName("");
      setNewDesc("");
      setQ("");
      toast.success(`Coleção “${c.name}” criada`);
    } catch (err) {
      toast.error(userMessage(err, "Não foi possível criar a coleção."));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    const c = cols?.find((x) => x.id === picked);
    if (!c || busy) return;
    setBusy("confirm");
    try {
      await onConfirm({ id: c.id, name: c.name });
      onOpenChange(false);
    } catch (err) {
      toast.error(userMessage(err, "Não foi possível adicionar à coleção."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className={s.content}>
        <div className={s.header}>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FolderPlus className="h-5 w-5 text-primary" />
            Adicionar à coleção
          </DialogTitle>
          <DialogDescription>
            {subject
              ? `Escolha a coleção para “${subject}”.`
              : `Escolha a coleção para ${count} lead(s).`}{" "}
            Leads ainda não salvos são salvos automaticamente, sem duplicar.
          </DialogDescription>
        </div>

        <div className={s.body}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar coleções"
              className="pl-9"
              aria-label="Pesquisar coleções"
              autoFocus
            />
          </div>

          <div className={s.list} role="radiogroup" aria-label="Coleções">
            {isLoading && (
              <div className="grid h-20 place-items-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {isError && (
              <div className="space-y-2 p-3 text-sm">
                <p className="text-destructive">{userMessage(error)}</p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Tentar novamente
                </Button>
              </div>
            )}
            {cols && !visible.length && (
              <p className="p-3 text-sm text-muted-foreground">
                {cols.length ? "Nenhuma coleção com esse nome." : "Você ainda não tem coleções."}
              </p>
            )}
            {visible.map((c) => {
              const on = picked === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(c.id)}
                  className={cn(s.option, on && s.optionSelected)}
                >
                  <span className={cn(s.radio, on && s.radioOn)} aria-hidden>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    {c.description && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {c.lead_count} lead(s)
                  </span>
                </button>
              );
            })}
          </div>

          {creating ? (
            <form onSubmit={create} className={s.newForm}>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da nova coleção"
                maxLength={120}
                aria-label="Nome da nova coleção"
                autoFocus
                required
              />
              <Input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Descrição (opcional)"
                maxLength={500}
                aria-label="Descrição da nova coleção"
              />
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={!newName.trim() || !!busy}>
                  {busy === "create" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Criar
                </Button>
              </div>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => {
                setCreating(true);
                setNewName(q.trim());
              }}
            >
              <Plus className="h-4 w-4" />
              Nova coleção
            </Button>
          )}
        </div>

        <div className={s.footer}>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={!!busy}>
            Cancelar
          </Button>
          <Button onClick={() => void confirm()} disabled={!picked || !!busy}>
            {busy === "confirm" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
            Adicionar {count > 1 ? `${count} leads` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
