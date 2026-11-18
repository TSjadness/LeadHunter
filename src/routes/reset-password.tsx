import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage, passwordProblem } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — LeadHunter" },
      { name: "description", content: "Crie uma nova senha para sua conta LeadHunter." },
      { property: "og:title", content: "Redefinir senha — LeadHunter" },
      { property: "og:description", content: "Crie uma nova senha para sua conta LeadHunter." },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // "checking" until Supabase has parsed the recovery link from the URL.
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const navigate = useNavigate();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) setState("ready");
    });
    // Also covers the case where the link was already processed before this effect ran.
    const t = setTimeout(async () => {
      const { data: s } = await supabase.auth.getSession();
      setState((cur) => (cur === "checking" ? (s.session ? "ready" : "invalid") : cur));
    }, 1200);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(pw);
    if (problem) return void setError(problem);
    if (pw !== pw2) return void setError("As senhas não conferem.");
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      // End other sessions that might have been opened with the old password.
      await supabase.auth.signOut({ scope: "others" });
      toast.success("Senha alterada com sucesso!");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="card-surface w-full max-w-sm p-6 animate-page-in sm:p-8">
        <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground">
          <KeyRound className="h-5 w-5" />
        </div>
        <h2 className="text-2xl font-bold">Nova senha</h2>
        {state === "checking" && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Validando o link…
          </p>
        )}
        {state === "invalid" && (
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">
              Este link é inválido ou expirou. Peça um novo link na tela de login.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth">Voltar para o login</Link>
            </Button>
          </div>
        )}
        {state === "ready" && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field
              id="p1"
              label="Nova senha"
              hint="Mínimo de 8 caracteres, com letras e números."
              error={error}
            >
              <Input
                id="p1"
                type="password"
                autoComplete="new-password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                aria-invalid={!!error}
              />
            </Field>
            <Field id="p2" label="Confirmar senha">
              <Input
                id="p2"
                type="password"
                autoComplete="new-password"
                required
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
