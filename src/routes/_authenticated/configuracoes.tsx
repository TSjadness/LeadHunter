import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage, passwordProblem, siteUrl } from "@/lib/auth";
import { saveSettings, settingsQuery } from "@/lib/leads-api";
import { UFS } from "@/lib/constants";
import { userMessage } from "@/lib/errors";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/AppShell";
import { Field } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — LeadHunter" },
      { name: "description", content: "Conta, tema, busca e provedores." },
    ],
  }),
  component: Config,
});

const PROVIDERS = [
  {
    id: "overpass",
    name: "OpenStreetMap · Overpass",
    use: "Busca completa de empresas por estado/cidade (servidores públicos, um por vez com fallback)",
    toggle: true,
  },
  {
    id: "nominatim",
    name: "OpenStreetMap · Nominatim",
    use: "Localiza a cidade e serve de busca textual rápida (1 requisição/s para todo o app)",
    toggle: true,
  },
  {
    id: "brasilapi",
    name: "BrasilAPI",
    use: "Consulta de CNPJ (dados públicos da Receita Federal)",
    toggle: false,
  },
  { id: "openfreemap", name: "OpenFreeMap", use: "Mapas", toggle: false },
] as const;

const THEMES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

function Config() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { mode, setMode } = useTheme();
  const { data: settings } = useQuery(settingsQuery);
  const hasPassword =
    (user.identities ?? []).some((i) => i.provider === "email") ||
    user.app_metadata?.["provider"] === "email";

  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [defUf, setDefUf] = useState<string>("none");
  const [defCity, setDefCity] = useState("");
  useEffect(() => {
    if (!settings) return;
    setDefUf(settings.default_uf ?? "none");
    setDefCity(settings.default_city ?? "");
  }, [settings]);
  const providers = (settings?.providers ?? {}) as Record<string, boolean>;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = passwordProblem(pw);
    if (p) return void setPwError(p);
    if (pw === current) return void setPwError("A nova senha deve ser diferente da atual.");
    setPwError(null);
    setBusy("pw");
    try {
      // Re-authenticate: proves knowledge of the current password before changing it.
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: current,
      });
      if (authErr) throw new Error("Senha atual incorreta.");
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      await supabase.auth.signOut({ scope: "others" });
      toast.success("Senha alterada", { description: "Outras sessões abertas foram encerradas." });
      setPw("");
      setCurrent("");
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "Senha atual incorreta."
          ? err.message
          : authErrorMessage(err),
      );
    } finally {
      setBusy(null);
    }
  };

  const sendSetPasswordLink = async () => {
    setBusy("link");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email!, {
        redirectTo: `${siteUrl()}/reset-password`,
      });
      if (error) throw error;
      toast.success("Enviamos um link para você definir uma senha.");
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const persist = async (
    patch: Parameters<typeof saveSettings>[0],
    msg = "Preferências salvas",
  ) => {
    try {
      await saveSettings(patch);
      await qc.invalidateQueries({ queryKey: ["user-settings"] });
      toast.success(msg);
    } catch (err) {
      toast.error(userMessage(err));
    }
  };

  const signOutOthers = async () => {
    setBusy("others");
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setBusy(null);
    if (error) toast.error(authErrorMessage(error));
    else toast.success("Outras sessões encerradas");
  };

  return (
    <>
      <PageHeader icon={Settings} title="Configurações" />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card-surface space-y-4 p-5">
          <h2 className="font-semibold">Conta</h2>
          <p className="text-sm">
            Conectado como <b className="break-all">{user.email}</b>
          </p>
          {hasPassword ? (
            <form onSubmit={changePassword} className="space-y-3">
              <Field id="cur" label="Senha atual">
                <Input
                  id="cur"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </Field>
              <Field
                id="new"
                label="Nova senha"
                hint="Mínimo de 8 caracteres, com letras e números."
                error={pwError}
              >
                <Input
                  id="new"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                  aria-invalid={!!pwError}
                />
              </Field>
              <Button type="submit" disabled={busy === "pw" || !current || !pw}>
                {busy === "pw" && <Loader2 className="h-4 w-4 animate-spin" />}
                Alterar senha
              </Button>
            </form>
          ) : (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Você entra com o Google. Se quiser também entrar com e-mail e senha, defina uma
                senha pelo link enviado ao seu e-mail.
              </p>
              <Button
                variant="outline"
                onClick={() => void sendSetPasswordLink()}
                disabled={busy === "link"}
              >
                {busy === "link" && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar link para definir senha
              </Button>
            </div>
          )}
          <div className="border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => void signOutOthers()}
              disabled={busy === "others"}
            >
              {busy === "others" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Sair de outros dispositivos
            </Button>
          </div>
        </section>

        <section className="card-surface space-y-4 p-5">
          <h2 className="font-semibold">Aparência</h2>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema">
            {THEMES.map((t) => (
              <button
                key={t.id}
                role="radio"
                aria-checked={mode === t.id}
                onClick={() => setMode(t.id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  mode === t.id
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </button>
            ))}
          </div>
          <h2 className="pt-2 font-semibold">Padrões da busca</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="def-uf" label="Estado padrão">
              <Select value={defUf} onValueChange={setDefUf}>
                <SelectTrigger id="def-uf">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {UFS.map(([s, n]) => (
                    <SelectItem key={s} value={s}>
                      {s} — {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="def-city" label="Cidade padrão">
              <Input
                id="def-city"
                maxLength={80}
                value={defCity}
                onChange={(e) => setDefCity(e.target.value)}
              />
            </Field>
          </div>
          <Button
            variant="outline"
            onClick={() =>
              void persist({
                default_uf: defUf === "none" ? null : defUf,
                default_city: defCity.trim() || null,
              })
            }
          >
            Salvar padrões
          </Button>
        </section>

        <section className="card-surface space-y-3 p-5 lg:col-span-2">
          <h2 className="font-semibold">Provedores de dados</h2>
          <ul className="divide-y divide-border">
            {PROVIDERS.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <b>{p.name}</b>
                  <p className="text-xs text-muted-foreground">{p.use}</p>
                </div>
                {p.toggle ? (
                  <Switch
                    checked={providers[p.id] !== false}
                    onCheckedChange={(v) =>
                      void persist(
                        { providers: { ...providers, [p.id]: v } },
                        v ? `${p.name} ativado` : `${p.name} desativado`,
                      )
                    }
                    aria-label={`Usar ${p.name}`}
                  />
                ) : (
                  <span className="text-xs font-medium text-success">Ativo</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Todos são gratuitos e não exigem cartão. O servidor pode desativar provedores
            globalmente pelo arquivo .env. Respeite a licença ODbL do OpenStreetMap ao usar os
            dados.
          </p>
        </section>
      </div>
    </>
  );
}
