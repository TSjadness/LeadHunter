import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, SearchCheck } from "lucide-react";
import { toast } from "sonner";
import { addInteraction, interactionsQuery, leadQuery, updateLead, type Lead } from "@/lib/leads-api";
import { lookupCnpj } from "@/lib/search.functions";
import { LEAD_STATUSES, NOT_VERIFIED } from "@/lib/constants";
import { PageHeader } from "@/components/AppShell";
import { LazyLeadMap } from "@/components/LeadMap/Lazy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/leads/$id")({
  head: () => ({ meta: [{ title: "Detalhes do lead — LeadHunter" }, { name: "description", content: "Dados empresariais do lead." }, { property: "og:title", content: "Detalhes do lead — LeadHunter" }, { property: "og:description", content: "Dados empresariais do lead." }] }),
  loader: ({ context, params }) => Promise.all([context.queryClient.ensureQueryData(leadQuery(params.id)), context.queryClient.ensureQueryData(interactionsQuery(params.id))]),
  component: LeadDetail,
});

const FIELDS: [keyof Lead, string][] = [
  ["name", "Nome"], ["legal_name", "Razão social"], ["trade_name", "Nome fantasia"], ["cnpj", "CNPJ"], ["cnae", "CNAE"],
  ["niche", "Nicho"], ["address", "Endereço"], ["city", "Cidade"], ["state", "UF"], ["phone", "Telefone"], ["email", "E-mail"],
  ["website", "Website"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["revenue", "Faturamento (R$)"], ["revenue_source", "Fonte do faturamento"],
];

function LeadDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: lead } = useSuspenseQuery(leadQuery(id));
  const { data: interactions } = useSuspenseQuery(interactionsQuery(id));
  const cnpjFn = useServerFn(lookupCnpj);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("nota");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (lead) setForm(lead); }, [lead]);

  if (!lead) return <p>Lead não encontrado. <Link to="/leads" className="text-primary underline">Voltar</Link></p>;

  const set = (k: keyof Lead, v: string) => setForm((f) => ({ ...f, [k]: v === "" ? null : v }));
  const save = async () => {
    try {
      const { id: _i, user_id: _u, created_at: _c, updated_at: _up, ...patch } = form as Lead;
      await updateLead(id, { ...patch, revenue: patch.revenue != null ? Number(patch.revenue) : null });
      await qc.invalidateQueries(); toast.success("Lead atualizado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };
  const enrich = async () => {
    const cnpj = (form.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length !== 14) return void toast.error("Informe um CNPJ com 14 dígitos");
    setBusy(true);
    try {
      const r = await cnpjFn({ data: { cnpj } });
      if (!r.ok) return void toast.error(r.error);
      setForm((f) => ({ ...f, cnpj, legal_name: r.data.legal_name ?? f.legal_name, trade_name: r.data.trade_name ?? f.trade_name, cnae: r.data.cnae ?? f.cnae, address: f.address ?? r.data.address, city: f.city ?? r.data.city, state: f.state ?? r.data.state, phone: f.phone ?? r.data.phone, email: f.email ?? r.data.email, verified_at: new Date().toISOString() }) as Partial<Lead>);
      toast.success(`BrasilAPI: ${r.data.situacao ?? "dados carregados"}. Clique em Salvar.`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  };
  const addNote = async () => { if (!note.trim()) return; await addInteraction(id, kind, note.trim()); setNote(""); qc.invalidateQueries({ queryKey: ["interactions", id] }); };

  return (
    <>
      <Link to="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</Link>
      <PageHeader title={lead.name} subtitle={`Fonte: ${lead.source === "osm" ? `OpenStreetMap (${lead.source_id})` : lead.source} · Verificado: ${lead.verified_at ? new Date(lead.verified_at).toLocaleString("pt-BR") : "não"}`}
        actions={<><Button size="sm" onClick={save}><Save className="h-4 w-4" />Salvar</Button></>} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card-surface grid gap-3 p-5 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={form.status ?? "novo"} onValueChange={(v) => set("status", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEAD_STATUSES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent></Select>
          </div>
          {FIELDS.map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label>{label}</Label>
              <div className="flex gap-1">
                <Input value={(form[k] as string | number | null) ?? ""} onChange={(e) => set(k, e.target.value)} placeholder={k === "revenue" ? "Somente se documentado" : NOT_VERIFIED} type={k === "revenue" ? "number" : "text"} />
                {k === "cnpj" && <Button variant="outline" size="icon" onClick={enrich} disabled={busy} title="Consultar BrasilAPI">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SearchCheck className="h-4 w-4" />}</Button>}
              </div>
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2"><Label>Notas</Label><Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <div className="space-y-4">
          {lead.lat && lead.lng && (
            <div className="card-surface h-64 p-1"><LazyLeadMap points={[{ id: lead.id, name: lead.name, lat: lead.lat, lng: lead.lng }]} /></div>
          )}
          {lead.lat && lead.lng && <Button asChild variant="outline" size="sm" className="w-full"><a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/directions?to=${lead.lat}%2C${lead.lng}`}>Abrir rota externa</a></Button>}
          <div className="card-surface space-y-3 p-5">
            <h3 className="font-semibold">Interações</h3>
            <div className="flex gap-2">
              <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent>{["nota", "ligação", "whatsapp", "e-mail", "reunião"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Descrição" onKeyDown={(e) => e.key === "Enter" && addNote()} />
            </div>
            <Button size="sm" className="w-full" onClick={addNote}>Registrar</Button>
            <ul className="space-y-2 text-sm">
              {interactions.map((i) => <li key={i.id} className="rounded-lg bg-muted p-2"><b className="capitalize">{i.kind}</b> · <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString("pt-BR")}</span><p>{i.content}</p></li>)}
              {!interactions.length && <li className="text-muted-foreground">Nenhuma interação.</li>}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
