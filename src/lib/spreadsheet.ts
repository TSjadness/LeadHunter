// Spreadsheet helpers. Heavy libraries (SheetJS, PapaParse) are imported on demand so
// they never weigh on the initial page load.
import { priorityLabel } from "./constants";
import type { Lead } from "./leads-api";
import { MAX_IMPORT_ROWS } from "./import";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Neutralises spreadsheet formula injection (=, +, -, @, tab, CR at the start of a cell). */
export function safeCell(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export const EXPORT_COLUMNS: (keyof Lead)[] = [
  "name",
  "trade_name",
  "legal_name",
  "cnpj",
  "cnae",
  "niche",
  "status",
  "priority",
  "phone",
  "whatsapp",
  "email",
  "website",
  "instagram",
  "facebook",
  "linkedin",
  "address",
  "city",
  "state",
  "lat",
  "lng",
  "revenue",
  "revenue_source",
  "notes",
  "source",
  "source_id",
  "verified_at",
  "status_changed_at",
  "created_at",
  "updated_at",
  "id",
];

export function toExportRows(leads: Lead[]) {
  return leads.map((l) =>
    Object.fromEntries(
      EXPORT_COLUMNS.map((k) => [
        k,
        // Human-readable priority ("Alta"); the importer reads it back.
        k === "priority" ? priorityLabel(l.priority) : safeCell(l[k] ?? ""),
      ]),
    ),
  );
}

export async function parseFile(f: File): Promise<Record<string, unknown>[]> {
  if (f.size > MAX_IMPORT_BYTES)
    throw new Error("Arquivo maior que 10 MB. Divida a planilha em partes.");
  let data: Record<string, unknown>[];
  if (/\.(xlsx|xls)$/i.test(f.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), {
      dense: true,
      cellFormula: false,
      cellHTML: false,
    });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    if (!sheet) throw new Error("A planilha está vazia.");
    data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  } else if (/\.json$/i.test(f.name)) {
    const j = JSON.parse(await f.text()) as unknown;
    const arr = Array.isArray(j)
      ? j
      : j && typeof j === "object" && Array.isArray((j as { leads?: unknown }).leads)
        ? (j as { leads: unknown[] }).leads
        : [];
    data = arr.filter(
      (x): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x),
    );
  } else {
    const Papa = (await import("papaparse")).default;
    const text = await f.text();
    data = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
    }).data;
  }
  if (data.length > MAX_IMPORT_ROWS)
    throw new Error(`Máximo de ${MAX_IMPORT_ROWS.toLocaleString("pt-BR")} linhas por importação.`);
  return data;
}

function download(name: string, content: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportCsv(leads: Lead[], name = `leads-${stamp()}.csv`) {
  const Papa = (await import("papaparse")).default;
  // BOM so Excel opens accents correctly.
  download(name, "\uFEFF" + Papa.unparse(toExportRows(leads)), "text/csv;charset=utf-8");
}

export async function exportXlsx(leads: Lead[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(toExportRows(leads));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  XLSX.writeFile(wb, `leads-${stamp()}.xlsx`);
}

export function exportJson(leads: Lead[], backup = false) {
  const rows = leads.map(({ user_id: _u, name_key: _k, ...rest }) => rest);
  const body = backup ? { exported_at: new Date().toISOString(), version: 2, leads: rows } : rows;
  download(
    backup ? `leadhunter-backup-${stamp()}.json` : `leads-${stamp()}.json`,
    JSON.stringify(body, null, 2),
    "application/json",
  );
}

export async function exportErrorsCsv(rows: { line: number; error: string; name: string }[]) {
  const Papa = (await import("papaparse")).default;
  download(
    `erros-importacao-${stamp()}.csv`,
    "\uFEFF" +
      Papa.unparse(rows.map((r) => ({ linha: r.line, nome: safeCell(r.name), erro: r.error }))),
    "text/csv;charset=utf-8",
  );
}
