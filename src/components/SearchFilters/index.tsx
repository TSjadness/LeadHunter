import { useState, type ReactNode } from "react";
import { Search, Square } from "lucide-react";
import { NICHE_SUGGESTIONS, UFS } from "@/lib/constants";
import { searchInputSchema, type SearchInput } from "@/lib/schemas";
import type { SearchParams } from "@/lib/search-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as s from "./styles";

type FieldKey = keyof SearchParams;
type Errors = Partial<Record<FieldKey, string>>;

function FormField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>
        {label}
      </label>
      {children}
      <p
        id={`${id}-msg`}
        className={cn(s.message, error ? s.error : s.hint)}
        role={error ? "alert" : undefined}
      >
        {error ?? hint ?? " "}
      </p>
    </div>
  );
}

export function SearchFilters({
  value,
  onChange,
  running,
  showSuggestions,
  onSubmit,
  onCancel,
}: {
  value: SearchParams;
  onChange: (patch: Partial<SearchParams>) => void;
  running: boolean;
  showSuggestions: boolean;
  onSubmit: (params: SearchInput & SearchParams) => void;
  onCancel: () => void;
}) {
  const [errors, setErrors] = useState<Errors>({});

  const update = (patch: Partial<SearchParams>) => {
    onChange(patch);
    // Clear the error of the field being edited.
    const keys = Object.keys(patch) as FieldKey[];
    if (keys.some((k) => errors[k])) {
      setErrors((e) => {
        const n = { ...e };
        keys.forEach((k) => delete n[k]);
        return n;
      });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = searchInputSchema.safeParse(value);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as FieldKey | undefined;
        if (k && !next[k]) next[k] = issue.message.charAt(0).toUpperCase() + issue.message.slice(1);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit({ ...parsed.data, city: parsed.data.city ?? "" });
  };

  return (
    <form onSubmit={submit} className={s.form} noValidate>
      <FormField
        id="niche"
        label="Segmento"
        hint="Ex.: dentista, academia, pet shop"
        error={errors.niche}
      >
        <Input
          id="niche"
          list="niche-suggestions"
          value={value.niche}
          onChange={(e) => update({ niche: e.target.value })}
          placeholder="Que tipo de negócio?"
          maxLength={60}
          autoComplete="off"
          className={s.control}
          aria-invalid={!!errors.niche}
          aria-describedby="niche-msg"
        />
        <datalist id="niche-suggestions">
          {NICHE_SUGGESTIONS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </FormField>

      <FormField id="uf" label="Estado" error={errors.uf}>
        <Select value={value.uf} onValueChange={(v) => update({ uf: v })}>
          <SelectTrigger
            id="uf"
            className={cn(s.control, "text-sm")}
            aria-invalid={!!errors.uf}
            aria-describedby="uf-msg"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BR">🇧🇷 Todo o Brasil (busca rápida)</SelectItem>
            {UFS.map(([uf, n]) => (
              <SelectItem key={uf} value={uf}>
                {uf} — {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        id="city"
        label="Cidade (opcional)"
        hint="Nome oficial do município"
        error={errors.city}
      >
        <Input
          id="city"
          value={value.city}
          onChange={(e) => update({ city: e.target.value })}
          placeholder="Ex.: Campinas"
          maxLength={80}
          className={s.control}
          aria-invalid={!!errors.city}
          aria-describedby="city-msg"
        />
      </FormField>

      <FormField id="limit" label="Quantidade" hint="Até 200" error={errors.limit}>
        <Input
          id="limit"
          type="number"
          inputMode="numeric"
          min={1}
          max={200}
          value={value.limit}
          onChange={(e) =>
            update({ limit: Math.min(200, Math.max(1, Number(e.target.value) || 1)) })
          }
          className={s.control}
          aria-invalid={!!errors.limit}
          aria-describedby="limit-msg"
        />
      </FormField>

      <div className={s.actions}>
        <span className={s.actionsSpacer} aria-hidden />
        {running ? (
          <Button type="button" variant="outline" onClick={onCancel} className={s.button}>
            <Square className="h-4 w-4" />
            Cancelar
          </Button>
        ) : (
          <Button type="submit" className={s.button}>
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        )}
      </div>

      {showSuggestions && (
        <div className={s.suggestions} aria-label="Sugestões de segmento">
          {NICHE_SUGGESTIONS.slice(0, 8).map((n) => (
            <button key={n} type="button" onClick={() => update({ niche: n })} className={s.chip}>
              {n}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
