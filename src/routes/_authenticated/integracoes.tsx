import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FlaskConical, KeyRound, Loader2, Pencil, Plug, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteIntegration,
  listIntegrations,
  saveIntegration,
  setIntegrationFlags,
  testIntegration,
  type IntegrationView,
} from "@/lib/integrations.functions";
import { userMessage } from "@/lib/errors";
import { checkOutboundUrl } from "@/lib/net-guard";
import { PageHeader } from "@/components/AppShell";
import { ConfirmDialog, EmptyState, Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações de API — LeadHunter" },
      { name: "description", content: "Conecte suas próprias APIs de leads." },
    ],
  }),
  component: Integracoes,
});

type FormState = {
  id?: string;
  name: string;
  url: string;
  method: "GET" | "POST";
  header_name: string;
  header_value: string;
  results_path: string;
  has_secret?: boolean;
};
const EMPTY: FormState = {
  name: "",
  url: "",
  method: "GET",
  header_name: "",
  header_value: "",
  results_path: "",
};

function Integracoes() {
  const qc = useQueryClient();
  const listFn = useServerFn(listIntegrations);
  const saveFn = useServerFn(saveIntegration);
  const flagsFn = useServerFn(setIntegrationFlags);
  const deleteFn = useServerFn(deleteIntegration);
  const testFn = useServerFn(testIntegration);
  const { data, isLoading, error } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => listFn(),
  });
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [removing, setRemoving] = useState<IntegrationView | null>(null);
  const reload = () => qc.invalidateQueries({ queryKey: ["integrations"] });

  const urlCheck = form.url
    ? checkOutboundUrl(form.url.replace(/\{(niche|uf|city|limit)\}/g, "x"))
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (urlCheck && !urlCheck.ok) return void toast.error(`Link da API: ${urlCheck.reason}`);
    setSaving(true);
    try {
      await saveFn({
        data: {
          ...(form.id ? { id: form.id } : {}),
          name: form.name,
          url: form.url.trim(),
          method: form.method,
          header_name: form.header_name || null,
          // Editing: blank keeps the stored key. New: blank = no key.
          ...(form.header_value || !form.id ? { header_value: form.header_value } : {}),
          results_path: form.results_path || null,
        },
      });
      toast.success(form.id ? "Integração atualizada" : "API adicionada");
      setForm(EMPTY);
      await reload();
    } catch (err) {
      toast.error(userMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const flag = async (
    r: IntegrationView,
    patch: { enabled?: boolean; use_in_search?: boolean },
  ) => {
    qc.setQueryData<typeof data>(
      ["integrations"],
      (old) =>
        old && { ...old, items: old.items.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) },
    );
    try {
      await flagsFn({ data: { id: r.id, ...patch } });
    } catch (err) {
      toast.error(userMessage(err));
      await reload();
    }
  };

  const run = async (r: IntegrationView) => {
    setBusy(r.id);
    try {
      const res = await testFn({
        data: { id: r.id, niche: "restaurante", uf: "SP", city: "Campinas" },
      });
      setResult((s) => ({
        ...s,
        [r.id]: res.ok
          ? {
              ok: true,
              text: `${res.count} lead(s) reconhecido(s)${res.preview.length ? ": " + res.preview.join(", ") : ""}\n\nInício da resposta:\n${res.sample}`,
            }
          : { ok: false, text: res.error },
      }));
    } catch (err) {
      setResult((s) => ({ ...s, [r.id]: { ok: false, text: userMessage(err) } }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await deleteFn({ data: { id: removing.id } });
      toast.success("Integração removida");
      if (form.id === removing.id) setForm(EMPTY);
      await reload();
    } catch (err) {
      toast.error(userMessage(err));
    }
  };

  const f = (k: "name" | "url" | "header_name" | "header_value" | "results_path") => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <>
      <PageHeader
        icon={Plug}
        title="Integrações de API"
        subtitle="Conecte qualquer API que retorne empresas em JSON. Ela será consultada junto com o OpenStreetMap em cada pesquisa."
      />

      <form onSubmit={submit} className="card-surface grid gap-4 p-4 sm:p-5 md:grid-cols-2">
        <h2 className="font-semibold md:col-span-2">
          {form.id ? `Editando “${form.name}”` : "Adicionar API"}
        </h2>
        <Field id="i-name" label="Nome">
          <Input
            id="i-name"
            required
            maxLength={80}
            placeholder="ex.: Minha API de empresas"
            {...f("name")}
          />
        </Field>
        <Field id="i-method" label="Método">
          <Select
            value={form.method}
            onValueChange={(v) => setForm({ ...form, method: v as "GET" | "POST" })}
          >
            <SelectTrigger id="i-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST (variáveis no corpo JSON)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field
          id="i-url"
          label="Link da API"
          className="md:col-span-2"
          error={urlCheck && !urlCheck.ok ? urlCheck.reason : null}
          hint={
            <>
              Use {"{niche}"}, {"{uf}"}, {"{city}"} e {"{limit}"} para inserir os dados da pesquisa.
              Apenas https:// para domínios públicos.
            </>
          }
        >
          <Input
            id="i-url"
            required
            maxLength={2000}
            placeholder="https://api.exemplo.com/empresas?q={niche}&uf={uf}&cidade={city}&limite={limit}"
            aria-invalid={!!urlCheck && !urlCheck.ok}
            {...f("url")}
          />
        </Field>
        <Field
          id="i-hname"
          label="Cabeçalho de autenticação (opcional)"
          hint="ex.: Authorization ou X-API-Key"
        >
          <Input id="i-hname" maxLength={100} {...f("header_name")} />
        </Field>
        <Field
          id="i-hval"
          label="Valor do cabeçalho"
          hint={
            form.has_secret
              ? "Há uma chave salva. Deixe em branco para mantê-la."
              : data && !data.canStoreSecrets
                ? "O servidor ainda não tem chave de criptografia configurada — não será possível salvar chaves."
                : "Guardada criptografada no servidor; nunca é exibida de novo."
          }
        >
          <Input
            id="i-hval"
            type="password"
            autoComplete="off"
            maxLength={2000}
            placeholder={form.has_secret ? "•••••••• (mantida)" : "ex.: Bearer sua-chave"}
            disabled={!form.header_name}
            {...f("header_value")}
          />
        </Field>
        <Field
          id="i-path"
          label="Caminho da lista no JSON (opcional)"
          hint="ex.: data.results — vazio = detecta automaticamente"
        >
          <Input id="i-path" maxLength={200} {...f("results_path")} />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            {form.id ? "Salvar alterações" : "Adicionar API"}
          </Button>
          {form.id && (
            <Button type="button" variant="ghost" onClick={() => setForm(EMPTY)}>
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <div className="mt-4 space-y-3">
        {isLoading && <Skeleton className="h-24 rounded-xl" />}
        {error && (
          <EmptyState
            title="Não foi possível carregar as integrações"
            description={userMessage(error)}
          />
        )}
        {data && !data.items.length && (
          <div className="card-surface">
            <EmptyState
              icon={Plug}
              title="Nenhuma API adicionada"
              description="Suas APIs aparecem aqui e são consultadas em paralelo com o OpenStreetMap."
            />
          </div>
        )}
        {data?.items.map((r) => (
          <div key={r.id} className="card-surface space-y-3 p-4 animate-page-in">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {r.name}
                  {r.has_secret && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      <KeyRound className="h-3 w-3" /> chave protegida
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.method} {r.url}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Ativa
                <Switch checked={r.enabled} onCheckedChange={(v) => void flag(r, { enabled: v })} />
              </label>
              <label className="flex items-center gap-2 text-sm">
                Usar na pesquisa
                <Switch
                  checked={r.use_in_search}
                  disabled={!r.enabled}
                  onCheckedChange={(v) => void flag(r, { use_in_search: v })}
                />
              </label>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void run(r)}
                  disabled={busy === r.id}
                >
                  {busy === r.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FlaskConical className="h-4 w-4" />
                  )}
                  Testar
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setForm({
                      id: r.id,
                      name: r.name,
                      url: r.url,
                      method: r.method,
                      header_name: r.header_name ?? "",
                      header_value: "",
                      results_path: r.results_path ?? "",
                      has_secret: r.has_secret,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  aria-label={`Editar ${r.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setRemoving(r)}
                  aria-label={`Remover ${r.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {result[r.id] && (
              <pre
                className={`max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg p-3 text-xs ${result[r.id]!.ok ? "bg-muted" : "bg-destructive/10 text-destructive"}`}
              >
                {result[r.id]!.ok ? "✓ " : "✗ "}
                {result[r.id]!.text}
              </pre>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        Campos reconhecidos automaticamente: nome/name, telefone/phone, whatsapp, email,
        site/website, endereco/address, cidade/city, uf/state, lat/lng, cnpj, instagram, facebook,
        linkedin. Endereços internos ou privados são bloqueados por segurança, e dados ausentes
        ficam como não verificados.
      </p>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remover “${removing?.name}”?`}
        description="A chave salva também será apagada."
        confirmLabel="Remover"
        destructive
        onConfirm={remove}
      />
    </>
  );
}
