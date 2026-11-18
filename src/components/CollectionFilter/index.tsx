import { useQuery } from "@tanstack/react-query";
import { FolderHeart } from "lucide-react";
import { collectionsQuery } from "@/lib/leads-api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as s from "./styles";

const ALL = "__all__";

/** Select of the user's collections (from Supabase). `null` = all collections. */
export function CollectionFilter({
  value,
  onChange,
  id = "collection-filter",
}: {
  value: string | null;
  onChange: (collectionId: string | null) => void;
  id?: string;
}) {
  const { data: cols, isLoading, isError } = useQuery(collectionsQuery);
  return (
    <div className={s.wrapper}>
      <label htmlFor={id} className={s.label}>
        <FolderHeart className="mr-1 inline h-4 w-4" />
        Coleção
      </label>
      <Select
        value={value ?? ALL}
        onValueChange={(v) => onChange(v === ALL ? null : v)}
        disabled={isLoading || isError}
      >
        <SelectTrigger id={id} className={s.trigger} aria-label="Filtrar por coleção">
          <SelectValue
            placeholder={
              isLoading ? "Carregando coleções…" : isError ? "Coleções indisponíveis" : undefined
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as coleções</SelectItem>
          {cols?.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="truncate">{c.name}</span>
              <span className={s.count}>{c.lead_count}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
