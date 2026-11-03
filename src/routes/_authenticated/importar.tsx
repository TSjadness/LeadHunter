import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import Papa from "papaparse";
import { Download, Upload, Database } from "lucide-react";
import { toast } from "sonner";
import { collectionsQuery, leadsQuery, saveLeads } from "@/lib/leads-api";
import { IMPORT_FIELDS, guessMapping, mapRow, type ImportField } from "@/lib/import";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({ meta: [{ title: "Importar e exportar — LeadHunter" }, { name: "description", content: "Importe e exporte leads em CSV ou JSON." }, { property: "og:title", content: "Importar e exportar — LeadHunter" }, { property: "og:description", content: "Importe e exporte leads em CSV ou JSON." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(leadsQuery),
  component: Importar,
});

function download(name: string, content: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function Importar() {
  const { data: leads } = useSuspenseQuery(leadsQuery);
  const qc = useQueryClient();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField | "">>({});
  const [report, setReport] = useState<{ inserted: number; conflicts: string[]; invalid: string[] } | null>(null);

  const onFile = async (f: File) => {
    setReport(null);
    const text = await f.text();
    let data: Record<string, unknown>[] = [];
    try {
      if (f.name.endsWith(".json")) { const j = JSON.parse(text); data = Array.isArray(j) ? j : j.leads ?? []; }
      else data = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true }).data;
    } catch { return void toast.error("Arquivo inválido"); }
    setRows(data); setMapping(guessMapping(Object.keys(data[0] ?? {})));
  };

  const doImport = async () => {
    const valid: (Partial<Record<ImportField, string>> & { name: string })[] = []; const invalid: string[] = [];
    rows.forEach((r, i) => { const m = mapRow(r, mapping); m.ok ? valid.push(m.value) : invalid.push(`Linha ${i + 2}: ${m.error}`); });
    try {
      const res = await saveLeads(valid.map((v) => ({ ...v, source: "importacao" })));
      setReport({ inserted: res.inserted.length, conflicts: res.conflicts, invalid }); setRows([]);
      qc.invalidateQueries(); toast.success(`${res.inserted.length} leads importados`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const backup = async () => {
    const cols = await qc.fetchQuery(collectionsQuery);
    download(`leadhunter-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exported_at: new Date().toISOString(), leads, collections: cols }, null, 2), "application/json");
  };

  return (
    <>
      <PageHeader title="Importar / Exportar" subtitle="CSV ou JSON com prévia, mapeamento de colunas e relatório de conflitos" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-surface space-y-3 p-5">
          <h3 className="font-semibold">Exportar ({leads.length} leads)</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => download("leads.csv", Papa.unparse(leads), "text/csv")}><Download className="h-4 w-4" />CSV</Button>
            <Button variant="outline" onClick={() => download("leads.json", JSON.stringify(leads, null, 2), "application/json")}><Download className="h-4 w-4" />JSON</Button>
            <Button onClick={backup}><Database className="h-4 w-4" />Backup completo</Button>
          </div>
        </div>
        <div className="card-surface space-y-3 p-5">
          <h3 className="font-semibold">Importar</h3>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:border-primary">
            <Upload className="h-5 w-5" />Escolher arquivo .csv ou .json
            <input type="file" accept=".csv,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card-surface mt-4 space-y-4 p-5">
          <h3 className="font-semibold">Mapeamento de colunas · {rows.length} linhas</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.keys(mapping).map((col) => (
              <label key={col} className="text-sm"><span className="text-muted-foreground">{col}</span>
                <select className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5" value={mapping[col]} onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value as ImportField | "" }))}>
                  <option value="">— ignorar —</option>{IMPORT_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr>{Object.keys(mapping).map((c) => <th key={c} className="p-1 text-left">{c}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t border-border">{Object.keys(mapping).map((c) => <td key={c} className="p-1">{String(r[c] ?? "")}</td>)}</tr>)}</tbody></table></div>
          <Button onClick={doImport}>Importar {rows.length} linhas</Button>
        </div>
      )}

      {report && (
        <div className="card-surface mt-4 space-y-2 p-5 text-sm">
          <h3 className="font-semibold">Relatório</h3>
          <p>✅ {report.inserted} importados · ⚠️ {report.conflicts.length} duplicados ignorados · ❌ {report.invalid.length} inválidos</p>
          {report.conflicts.length > 0 && <p className="text-muted-foreground">Duplicados: {report.conflicts.slice(0, 20).join(", ")}</p>}
          {report.invalid.length > 0 && <p className="text-muted-foreground">{report.invalid.slice(0, 20).join(" · ")}</p>}
        </div>
      )}
    </>
  );
}
