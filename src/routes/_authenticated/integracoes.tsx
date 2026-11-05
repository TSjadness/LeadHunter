import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plug, Trash2, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { testIntegration } from "@/lib/search.functions";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({ meta: [{ title: "Integrações de API — LeadHunter" }, { name: "description", content: "Conecte suas próprias APIs de leads." }, { property: "og:title", content: "Integrações de API — LeadHunter" }, { property: "og:description", content: "Conecte suas próprias APIs de leads." }] }),
  component: Integracoes,
});

type Row = { id: string; name: string; url: string; method: string; header_name: string | null; header_value: string | null; results_path: string | null; enabled: boolean; use_in_search: boolean };
const empty = { name: "", url: "", method: "GET", header_name: "", header_value: "", results_path: "" };

function Integracoes() {
  const test = useServerFn(testIntegration);
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase.from("api_integrations").select("*").order("created_at");
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => { void load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try { new URL(form.url.replace(/\{\w+\}/g, "x")); } catch { return void toast.error("Link da API inválido"); }
    const { error } = await supabase.from("api_integrations").insert({
      name: form.name.trim(), url: form.url.trim(), method: form.method,
      header_name: form.header_name.trim() || null, header_value: form.header_value || null, results_path: form.results_path.trim() || null,
    });
    if (error) return void toast.error(error.message);
    toast.success("API adicionada"); setForm(empty); void load();
  };
  const update = async (id: string, patch: Partial<Row>) => { await supabase.from("api_integrations").update(patch).eq("id", id); void load(); };
  const remove = async (id: string) => { await supabase.from("api_integrations").delete().eq("id", id); void load(); };
  const run = async (r: Row) => {
    setBusy(r.id);
    try {
      const res = await test({ data: { id: r.id, niche: "restaurante", uf: "SP", city: "Campinas" } });
      setResult((s) => ({ ...s, [r.id]: res.ok ? `✓ ${res.count} lead(s) reconhecido(s)${res.preview.length ? ": " + res.preview.join(", ") : ""}\n\nResposta:\n${res.sample}` : `✗ ${res.error}` }));
    } finally { setBusy(null); }
  };

  const f = (k: keyof typeof empty) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });

  return (
    <>
      <PageHeader title="Integrações de API" subtitle="Cole o link de qualquer API que retorne empresas em JSON. Ela será consultada junto com o OpenStreetMap em toda pesquisa." />
      <form onSubmit={add} className="card-surface grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-1.5"><Label>Nome</Label><Input required {...f("name")} placeholder="ex.: Minha API de empresas" /></div>
        <div className="space-y-1.5"><Label>Método</Label>
          <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent></Select>
        </div>
        <div className="space-y-1.5 md:col-span-2"><Label>Link da API</Label><Input required {...f("url")} placeholder="https://api.exemplo.com/empresas?q={niche}&uf={uf}&cidade={city}&limite={limit}" />
          <p className="text-xs text-muted-foreground">Use {"{niche}"}, {"{uf}"}, {"{city}"} e {"{limit}"} para inserir os dados da pesquisa. Em POST, eles também vão no corpo JSON.</p></div>
        <div className="space-y-1.5"><Label>Cabeçalho de autenticação (opcional)</Label><Input {...f("header_name")} placeholder="ex.: Authorization ou X-API-Key" /></div>
        <div className="space-y-1.5"><Label>Valor do cabeçalho</Label><Input type="password" {...f("header_value")} placeholder="ex.: Bearer sua-chave" /></div>
        <div className="space-y-1.5"><Label>Caminho da lista no JSON (opcional)</Label><Input {...f("results_path")} placeholder="ex.: data.results" /></div>
        <div className="flex items-end"><Button type="submit"><Plug className="h-4 w-4" />Adicionar API</Button></div>
      </form>

      <div className="mt-4 space-y-3">
        {!rows.length && <p className="text-sm text-muted-foreground">Nenhuma API adicionada ainda.</p>}
        {rows.map((r) => (
          <div key={r.id} className="card-surface space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1"><b>{r.name}</b><p className="truncate text-xs text-muted-foreground">{r.method} {r.url}</p></div>
              <label className="flex items-center gap-2 text-sm">Ativa<Switch checked={r.enabled} onCheckedChange={(v) => update(r.id, { enabled: v })} /></label>
              <label className="flex items-center gap-2 text-sm">Usar na pesquisa<Switch checked={r.use_in_search} onCheckedChange={(v) => update(r.id, { use_in_search: v })} /></label>
              <Button size="sm" variant="outline" onClick={() => run(r)} disabled={busy === r.id}>{busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}Testar</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>
            </div>
            {result[r.id] && <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{result[r.id]}</pre>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Campos reconhecidos automaticamente: nome/name, telefone/phone, email, site/website, endereco/address, cidade/city, uf/state, lat/lng, cnpj, instagram. Dados ausentes ficam como não verificados.</p>
    </>
  );
}
