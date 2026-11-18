import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { bulkUpdatePriority, bulkUpdateStatus, deleteLeads } from "@/lib/leads-api";
import { LEAD_PRIORITIES, LEAD_STATUSES, type LeadPriority } from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog, PriorityBadge, StatusBadge } from "@/components/common";
import { CollectionPicker } from "./CollectionPicker";

/** Floating action bar for selected leads. Sits at the bottom without covering content. */
export function BulkActions({
  ids,
  onClear,
  extra,
}: {
  ids: string[];
  onClear: () => void;
  extra?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  if (!ids.length) return null;

  const done = async (msg: string) => {
    await qc.invalidateQueries({ queryKey: ["leads"] });
    await qc.invalidateQueries({ queryKey: ["collections"] });
    toast.success(msg);
    onClear();
  };
  const setStatus = async (status: (typeof LEAD_STATUSES)[number]["id"]) => {
    try {
      await bulkUpdateStatus(ids, status);
      await done(`${ids.length} lead(s) atualizados`);
    } catch (e) {
      toast.error(userMessage(e));
    }
  };
  const setPriority = async (priority: LeadPriority) => {
    try {
      await bulkUpdatePriority(ids, priority);
      await done(`Prioridade de ${ids.length} lead(s) atualizada`);
    } catch (e) {
      toast.error(userMessage(e));
    }
  };
  const remove = async () => {
    try {
      await deleteLeads(ids);
      await done(`${ids.length} lead(s) excluídos`);
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  return (
    <>
      {/* Spacer so the floating bar never hides the last rows. */}
      <div className="h-20" aria-hidden />
      <div
        role="toolbar"
        aria-label="Ações para os selecionados"
        className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-border bg-popover/95 p-2.5 shadow-elevated backdrop-blur-md animate-pop-in sm:inset-x-6 md:left-auto md:right-8 md:w-auto"
      >
        <span className="px-2 text-sm font-semibold">{ids.length} selecionado(s)</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Mudar status <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {LEAD_STATUSES.map((s) => (
              <DropdownMenuItem key={s.id} onSelect={() => void setStatus(s.id)}>
                <StatusBadge status={s.id} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              Prioridade <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {LEAD_PRIORITIES.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => void setPriority(p.id)}>
                <PriorityBadge priority={p.id} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <CollectionPicker leadIds={ids} label="Coleção" onDone={onClear} />
        {extra}
        <Button
          size="sm"
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirm(true)}
        >
          <Trash2 className="h-4 w-4" />
          Excluir
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto h-8 w-8"
          onClick={onClear}
          aria-label="Limpar seleção"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Excluir ${ids.length} lead(s)?`}
        description="Interações, histórico e vínculos com coleções desses leads também serão removidos. Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
