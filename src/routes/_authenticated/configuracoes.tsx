import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/theme";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — LeadHunter" }, { name: "description", content: "Provedores, tema e conta." }, { property: "og:title", content: "Configurações — LeadHunter" }, { property: "og:description", content: "Provedores, tema e conta." }] }),
  component: Config,
});

const PROVIDERS = [
  { name: "Overpass (private.coffee)", use: "Descoberta geográfica de empresas", status: "Ativo · fallback overpass-api.de" },
  { name: "OpenFreeMap", use: "Visualização do mapa", status: "Ativo" },
  { name: "BrasilAPI", use: "Consulta de CNPJ (Receita Federal)", status: "Ativo" },
  { name: "OpenPlanetData", use: "Ingestão offline regional", status: "Planejado" },
];

function Config() {
  const { user } = Route.useRouteContext();
  const { dark, toggle } = useTheme();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");

  const change = async () => {
    if (pw.length < 6) return toast.error("Mínimo 6 caracteres");
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: current } as never);
    if (error) toast.error(error.message); else { toast.success("Senha alterada"); setPw(""); setCurrent(""); }
  };

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-surface space-y-3 p-5">
          <h3 className="font-semibold">Provedores de dados</h3>
          {PROVIDERS.map((p) => <div key={p.name} className="flex justify-between gap-2 border-b border-border py-2 text-sm last:border-0"><div><b>{p.name}</b><p className="text-xs text-muted-foreground">{p.use}</p></div><span className="text-xs text-success">{p.status}</span></div>)}
          <p className="text-xs text-muted-foreground">Nenhum provedor exige cartão ou chave paga. Respeite a licença ODbL do OpenStreetMap.</p>
        </div>
        <div className="card-surface space-y-4 p-5">
          <h3 className="font-semibold">Conta</h3>
          <p className="text-sm">Logado como <b>{user.email}</b></p>
          <label className="flex items-center justify-between text-sm">Tema escuro<Switch checked={dark} onCheckedChange={toggle} /></label>
          <div className="space-y-2"><Label>Senha atual</Label><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="space-y-2"><Label>Nova senha</Label><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <Button onClick={change}>Alterar senha</Button>
        </div>
      </div>
    </>
  );
}
