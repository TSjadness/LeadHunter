import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Loader2,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  authErrorMessage,
  googleEnabled,
  passwordProblem,
  signInWithGoogle,
  siteUrl,
} from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";

/** Only same-site relative paths are accepted (prevents open redirects). */
const safeRedirect = (r: unknown) => {
  if (typeof r !== "string") return "/dashboard";
  try {
    const u = new URL(r, "http://x");
    return u.origin === "http://x" &&
      u.pathname.startsWith("/") &&
      !u.pathname.startsWith("//") &&
      !u.pathname.startsWith("/auth")
      ? u.pathname + u.search
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
};

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().max(500).optional() }),
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

type Mode = "in" | "up" | "forgot";
const TITLES: Record<Mode, string> = { in: "Entrar", up: "Criar conta", forgot: "Recuperar senha" };

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);
  const navigate = useNavigate();
  const target = safeRedirect(search.redirect);

  const switchMode = (m: Mode) => {
    setMode(m);
    setSent(null);
    setPwError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "up") {
      const p = passwordProblem(password);
      setPwError(p);
      if (p) return;
    }
    setLoading(true);
    try {
      const mail = email.trim().toLowerCase();
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(mail, {
          redirectTo: `${siteUrl()}/reset-password`,
        });
        if (error && !/rate limit|security purposes/i.test(error.message)) throw error;
        // Same answer whether or not the e-mail exists (no account enumeration).
        setSent(
          "Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha.",
        );
      } else if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (error) throw error;
        navigate({ to: target });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { emailRedirectTo: `${siteUrl()}/dashboard` },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard" });
        else
          setSent(
            "Conta criada! Enviamos um link de confirmação para o seu e-mail. Abra-o para ativar o acesso.",
          );
      }
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      toast.error(authErrorMessage(err));
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gold opacity-20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-sidebar-primary opacity-10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gold text-sidebar-primary-foreground shadow-lg">
            <Crosshair className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold text-sidebar-accent-foreground">
            Lead<span className="text-sidebar-primary">Hunter</span>
          </span>
        </div>
        <div className="relative max-w-lg">
          <h1 className="text-4xl font-bold leading-tight text-sidebar-accent-foreground xl:text-5xl">
            Encontre empresas reais.
            <br />
            <span className="text-sidebar-primary">Feche mais negócios.</span>
          </h1>
          <ul className="mt-8 space-y-4 text-sm">
            {[
              {
                icon: MapIcon,
                text: "Descoberta geográfica com OpenStreetMap, por estado, cidade e segmento.",
              },
              { icon: Sparkles, text: "Enriquecimento por CNPJ (BrasilAPI) e suas próprias APIs." },
              {
                icon: ShieldCheck,
                text: "Seus dados isolados por conta, sem contatos inventados.",
              },
            ].map(({ icon: I, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <I className="h-4 w-4" />
                </span>
                <span className="pt-1.5">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs opacity-60">Dados © colaboradores OpenStreetMap (ODbL)</p>
      </div>

      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm animate-page-in">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gold text-sidebar-primary-foreground">
              <Crosshair className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-bold">
              Lead<span className="text-primary">Hunter</span>
            </span>
          </div>
          <div className="card-surface p-6 sm:p-8">
            <h2 className="text-2xl font-bold">{TITLES[mode]}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "in"
                ? "Bem-vindo de volta."
                : mode === "up"
                  ? "Leva menos de um minuto."
                  : "Enviaremos um link para o seu e-mail."}
            </p>

            {sent ? (
              <div className="mt-6 space-y-4 animate-pop-in" role="status">
                <div className="flex gap-3 rounded-lg bg-success/10 p-4 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  <p>{sent}</p>
                </div>
                <Button variant="outline" className="w-full" onClick={() => switchMode("in")}>
                  Voltar para Entrar
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4" noValidate={false}>
                {mode !== "forgot" && googleEnabled() && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => void google()}
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                        <path
                          fill="#4285F4"
                          d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"
                        />
                      </svg>
                      Continuar com Google
                    </Button>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" /> ou com e-mail{" "}
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  </>
                )}
                <Field id="email" label="E-mail">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                {mode !== "forgot" && (
                  <Field
                    id="pw"
                    label="Senha"
                    error={pwError}
                    hint={
                      mode === "up" ? "Mínimo de 8 caracteres, com letras e números." : undefined
                    }
                  >
                    <div className="relative">
                      <Input
                        id="pw"
                        type={showPw ? "text" : "password"}
                        autoComplete={mode === "in" ? "current-password" : "new-password"}
                        required
                        value={password}
                        aria-invalid={!!pwError}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (pwError) setPwError(passwordProblem(e.target.value));
                        }}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
                        aria-label={showPw ? "Ocultar senha" : "Mostrar senha"}
                      >
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </Field>
                )}
                {mode === "in" && (
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => switchMode("forgot")}
                  >
                    Esqueci minha senha
                  </button>
                )}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "in"
                    ? "Entrar"
                    : mode === "up"
                      ? "Criar conta"
                      : "Enviar link de recuperação"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => switchMode(mode === "in" ? "up" : "in")}
                >
                  {mode === "in" ? "Não tem conta? Criar agora" : "Já tenho conta — Entrar"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
