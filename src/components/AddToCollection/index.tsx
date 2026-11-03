import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addToCollection, collectionsQuery, createCollection } from "@/lib/leads-api";

/** Adds leads to an existing or brand new collection. getLeadIds may save leads first. */
export function AddToCollection({ getLeadIds, disabled, label = "Adicionar" }: { getLeadIds: () => Promise<string[]>; disabled?: boolean; label?: string }) {
  const qc = useQueryClient();
  const { data: cols = [] } = useQuery(collectionsQuery);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const add = async (collectionId: string, colName: string) => {
    try {
      const ids = await getLeadIds();
      await addToCollection(collectionId, ids);
      await qc.invalidateQueries();
      toast.success(`${ids.length} lead(s) em "${colName}"`);
      setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const createAndAdd = async () => {
    if (!name.trim()) return;
    try {
      const c = await createCollection(name);
      setName("");
      await add(c!.id, c!.name);
    } catch (e) { toast.error(e instanceof Error ? (e.message.includes("duplicate") ? "Já existe uma coleção com esse nome" : e.message) : "Erro"); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="outline" size="sm" disabled={disabled}><FolderPlus className="h-4 w-4" />{label}</Button></PopoverTrigger>
      <PopoverContent className="w-64 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">Adicionar à coleção</p>
        <div className="max-h-48 space-y-1 overflow-auto">
          {cols.map((c) => <button key={c.id} onClick={() => add(c.id, c.name)} className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">{c.name}</button>)}
          {!cols.length && <p className="text-xs text-muted-foreground">Nenhuma coleção ainda.</p>}
        </div>
        <div className="flex gap-1 border-t border-border pt-2">
          <Input placeholder="Nova coleção" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createAndAdd()} className="h-8" />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={createAndAdd} aria-label="Criar coleção"><Plus className="h-4 w-4" /></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
