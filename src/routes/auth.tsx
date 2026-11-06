import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — LeadHunter" },
      { name: "description", content: "Acesse sua conta LeadHunter para prospectar leads." },
      { property: "og:title", content: "Entrar — LeadHunter" },
      { property: "og:description", content: "Acesse sua conta LeadHunter para prospectar leads." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("Enviamos para seu e-mail o link para redefinir a senha.");
        setMode("in");
      } else if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else toast.success("Conta criada! Confirme pelo link enviado ao seu e-mail.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? (err.message === "Invalid login credentials" ? "E-mail ou senha inválidos" : err.message) : "Erro");
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("Não foi possível entrar com o Google. Tente novamente.");
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold text-sidebar-primary-foreground"><Crosshair className="h-5 w-5" /></div>
          <span className="font-display text-xl font-bold text-sidebar-accent-foreground">Lead<span className="text-sidebar-primary">Hunter</span></span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight text-sidebar-accent-foreground">Encontre empresas reais.<br /><span className="text-sidebar-primary">Feche mais negócios.</span></h1>
          <p className="mt-4 max-w-md text-sm">Descoberta geográfica com OpenStreetMap, consulta de CNPJ pela BrasilAPI, coleções e funil Kanban — tudo com dados abertos e verificáveis.</p>
        </div>
        <p className="text-xs opacity-60">Dados © colaboradores OpenStreetMap (ODbL)</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="card-surface w-full max-w-sm space-y-4 p-8">
          <h2 className="text-2xl font-bold">{mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : "Recuperar senha"}</h2>
          {mode !== "forgot" && (<>
            <Button type="button" variant="outline" className="w-full" onClick={google}>Continuar com Google</Button>
            <div className="text-center text-xs text-muted-foreground">ou com e-mail</div>
          </>)}
          <div className="space-y-2"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {mode !== "forgot" && <div className="space-y-2"><Label htmlFor="pw">Senha</Label><Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
          {mode === "in" && <button type="button" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode("forgot")}>Esqueci minha senha</button>}
          <Button type="submit" className="w-full" disabled={loading}>{loading && <Loader2 className="h-4 w-4 animate-spin" />}{mode === "in" ? "Entrar" : mode === "up" ? "Criar conta" : "Enviar link de recuperação"}</Button>
          <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "Não tem conta? Criar agora" : "Voltar para Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
