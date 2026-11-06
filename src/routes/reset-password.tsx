import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
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
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) return toast.error("As senhas não conferem.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error("Link inválido ou expirado. Peça um novo link.");
    toast.success("Senha alterada com sucesso!");
    navigate({ to: "/dashboard" });
  };
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card-surface w-full max-w-sm space-y-4 p-8">
        <h2 className="text-2xl font-bold">Nova senha</h2>
        <div className="space-y-2"><Label htmlFor="p1">Nova senha</Label><Input id="p1" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="p2">Confirmar senha</Label><Input id="p2" type="password" required minLength={6} value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={loading}>Salvar nova senha</Button>
      </form>
    </div>
  );
}
