import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAllLeads } from "@/lib/leads-api";
import { saveLeads } from "@/lib/leads.functions";
import {
  IMPORT_FIELD_LABELS,
  IMPORT_FIELDS,
  guessMapping,
  mapRow,
  type ImportField,
} from "@/lib/import";
import { exportCsv, exportErrorsCsv, exportJson, exportXlsx, parseFile } from "@/lib/spreadsheet";
import { userMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({
    meta: [
      { title: "Importar e exportar — LeadHunter" },
      { name: "description", content: "Importe e exporte leads em Excel, CSV ou JSON." },
    ],
  }),
  component: Importar,
});

type Report = {
  inserted: number;
  duplicates: string[];
  invalid: { line: number; error: string; name: string }[];
};
const BATCH = 500;

function Importar() {
  const qc = useQueryClient();
  const save = useServerFn(saveLeads);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField | "">>({});
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const onFile = async (f: File) => {
    setReport(null);
    try {
      const data = await parseFile(f);
      if (!data.length) return void toast.error("Nenhuma linha encontrada no arquivo.");
      setFileName(f.name);
      setRows(data);
      setMapping(guessMapping(Object.keys(data[0] ?? {})));
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.length < 200
          ? e.message
          : "Arquivo inválido ou corrompido.",
      );
    }
  };

  const validation = useMemo(() => {
    const valid: ReturnType<typeof mapRow>[] = [];
    const invalid: Report["invalid"] = [];
    rows.forEach((r, i) => {
      const m = mapRow(r, mapping);
      if (m.ok) valid.push(m);
      else {
        const nameCol = Object.entries(mapping).find(([, f]) => f === "name")?.[0];
        invalid.push({
          line: i + 2,
          error: m.error,
          name: nameCol ? String(r[nameCol] ?? "") : "",
        });
      }
    });
    return { valid: valid.flatMap((v) => (v.ok ? [v.value] : [])), invalid };
  }, [rows, mapping]);
  const hasName = Object.values(mapping).includes("name");

  const doImport = async () => {
    const items = validation.valid.map((v) => ({ ...v, source: "importacao" }));
    const rep: Report = { inserted: 0, duplicates: [], invalid: validation.invalid };
    setProgress(0);
    try {
      for (let i = 0; i < items.length; i += BATCH) {
        const r = await save({ data: { items: items.slice(i, i + BATCH) } });
        rep.inserted += r.inserted.length;
        rep.duplicates.push(...r.duplicates.map((d) => d.name));
        setProgress(Math.round(((i + BATCH) / items.length) * 100));
      }
      setReport(rep);
      setRows([]);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`${rep.inserted} lead(s) importados`);
    } catch (e) {
      setReport(rep);
      toast.error(`Importação interrompida: ${userMessage(e)}`, {
        description: `${rep.inserted} lead(s) já tinham sido importados.`,
      });
    } finally {
      setProgress(null);
    }
  };

  const runExport = async (kind: "xlsx" | "csv" | "json" | "backup") => {
    setExporting(kind);
    try {
      const leads = await fetchAllLeads();
      if (!leads.length) return void toast.message("Você ainda não tem leads para exportar.");
      if (kind === "xlsx") await exportXlsx(leads);
      else if (kind === "csv") await exportCsv(leads);
      else exportJson(leads, kind === "backup");
      toast.success(`${leads.length} lead(s) exportados`);
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setExporting(null);
    }
  };

  const ExportBtn = ({
    kind,
    label,
    variant = "outline",
  }: {
    kind: "xlsx" | "csv" | "json" | "backup";
    label: string;
    variant?: "outline" | "default";
  }) => (
    <Button variant={variant} onClick={() => void runExport(kind)} disabled={!!exporting}>
      {exporting === kind ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : kind === "backup" ? (
        <Database className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {label}
    </Button>
  );

  return (
    <>
      <PageHeader
        icon={FileUp}
        title="Importar / Exportar"
        subtitle="Excel, CSV ou JSON com prévia, mapeamento de colunas, validação e relatório de duplicados"
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-surface space-y-3 p-5">
          <h2 className="font-semibold">Exportar</h2>
          <p className="text-sm text-muted-foreground">
            Baixe todos os seus leads. Fórmulas são neutralizadas para abrir com segurança no Excel.
          </p>
          <div className="flex flex-wrap gap-2">
            <ExportBtn kind="xlsx" label="Excel" variant="default" />
            <ExportBtn kind="csv" label="CSV" />
            <ExportBtn kind="json" label="JSON" />
            <ExportBtn kind="backup" label="Backup completo" />
          </div>
        </div>
        <div className="card-surface space-y-3 p-5">
          <h2 className="font-semibold">Importar</h2>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files[0];
              if (f) void onFile(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors focus-within:ring-2 focus-within:ring-ring",
              drag
                ? "border-primary bg-accent/60 text-foreground"
                : "border-border hover:border-primary",
            )}
          >
            <Upload className="h-6 w-6" />
            <span>
              <b className="text-foreground">Escolha</b> ou arraste um arquivo .xlsx, .csv ou .json
            </span>
            <span className="text-xs">
              Até 10 MB / 10.000 linhas. A primeira linha deve ter os nomes das colunas.
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card-surface mt-4 space-y-4 p-5 animate-page-in">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <FileSpreadsheet className="h-4 w-4" />
              {fileName} · {rows.length.toLocaleString("pt-BR")} linha(s)
            </h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-4 w-4" />
                {validation.valid.length} válidas
              </span>
              <span
                className={cn(
                  "flex items-center gap-1",
                  validation.invalid.length ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <XCircle className="h-4 w-4" />
                {validation.invalid.length} com erro
              </span>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Mapeamento de colunas</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.keys(mapping).map((col) => (
                <label key={col} className="text-sm">
                  <span className="block truncate text-muted-foreground" title={col}>
                    {col}
                  </span>
                  <select
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={mapping[col]}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [col]: e.target.value as ImportField | "" }))
                    }
                  >
                    <option value="">— ignorar —</option>
                    {IMPORT_FIELDS.map((f) => (
                      <option
                        key={f}
                        value={f}
                        disabled={Object.entries(mapping).some(([c, v]) => v === f && c !== col)}
                      >
                        {IMPORT_FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!hasName && (
              <p className="mt-2 flex items-center gap-1 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" /> Mapeie uma coluna para “Nome” — ela é
                obrigatória.
              </p>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr>
                  {Object.keys(mapping).map((c) => (
                    <th key={c} className="whitespace-nowrap p-2 text-left font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    {Object.keys(mapping).map((c) => (
                      <td key={c} className="max-w-48 truncate p-2">
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {validation.invalid.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Linhas com erro serão ignoradas:{" "}
              {validation.invalid
                .slice(0, 6)
                .map((x) => `linha ${x.line} (${x.error})`)
                .join(" · ")}
              {validation.invalid.length > 6 ? " …" : ""}
            </p>
          )}
          {progress != null && (
            <Progress value={Math.min(progress, 100)} aria-label="Progresso da importação" />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void doImport()}
              disabled={!hasName || !validation.valid.length || progress != null}
            >
              {progress != null && <Loader2 className="h-4 w-4 animate-spin" />}
              Importar {validation.valid.length.toLocaleString("pt-BR")} linha(s)
            </Button>
            <Button variant="ghost" onClick={() => setRows([])} disabled={progress != null}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {report && (
        <div className="card-surface mt-4 space-y-3 p-5 text-sm animate-page-in" role="status">
          <h2 className="font-semibold">Relatório da importação</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-success/10 p-3">
              <p className="text-2xl font-bold tabular-nums">{report.inserted}</p>
              <p className="text-muted-foreground">importados</p>
            </div>
            <div className="rounded-lg bg-warning/15 p-3">
              <p className="text-2xl font-bold tabular-nums">{report.duplicates.length}</p>
              <p className="text-muted-foreground">duplicados ignorados</p>
            </div>
            <div className="rounded-lg bg-destructive/10 p-3">
              <p className="text-2xl font-bold tabular-nums">{report.invalid.length}</p>
              <p className="text-muted-foreground">inválidos</p>
            </div>
          </div>
          {report.duplicates.length > 0 && (
            <p className="text-muted-foreground">
              Duplicados: {report.duplicates.slice(0, 20).join(", ")}
              {report.duplicates.length > 20 ? " …" : ""}
            </p>
          )}
          {report.invalid.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void exportErrorsCsv(report.invalid)}
            >
              <Download className="h-4 w-4" />
              Baixar linhas com erro (CSV)
            </Button>
          )}
        </div>
      )}
    </>
  );
}
