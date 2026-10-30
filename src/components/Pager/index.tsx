import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-sm">
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-muted-foreground">{page} / {pages}</span>
      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Próxima">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
