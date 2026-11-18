// Auth helpers on top of Supabase Auth.
import { supabase } from "@/integrations/supabase/client";

export const googleEnabled = () => import.meta.env["VITE_AUTH_GOOGLE_ENABLED"] !== "false";

/** Public origin used in auth e-mails/redirects (falls back to the current origin). */
export function siteUrl() {
  const configured = (import.meta.env["VITE_SITE_URL"] as string | undefined)?.replace(/\/+$/, "");
  return configured || (typeof window !== "undefined" ? window.location.origin : "");
}

export const PASSWORD_MIN = 8;

/** Returns a pt-BR problem description, or null when the password is acceptable. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN) return `Use pelo menos ${PASSWORD_MIN} caracteres.`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Combine letras e números.";
  if (pw.length > 72) return "Use no máximo 72 caracteres.";
  return null;
}

/** Maps Supabase Auth errors to messages that do not reveal whether an account exists. */
export function authErrorMessage(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  const code = (e as { code?: string } | null)?.code ?? "";
  if (code === "invalid_credentials" || m.includes("invalid login credentials"))
    return "E-mail ou senha inválidos.";
  if (code === "email_not_confirmed" || m.includes("email not confirmed")) {
    return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  }
  if (code === "weak_password" || m.includes("password should"))
    return "Senha fraca: use 8+ caracteres combinando letras e números.";
  if (code === "same_password" || m.includes("different from the old"))
    return "A nova senha deve ser diferente da atual.";
  if (code.startsWith("over_") || m.includes("rate limit") || m.includes("security purposes")) {
    return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  }
  if (code === "reauthentication_needed" || m.includes("reauthentication"))
    return "Por segurança, entre novamente antes de trocar a senha.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sem conexão com o servidor de autenticação.";
  if (code === "provider_disabled" || m.includes("provider is not enabled"))
    return "Login com Google não está habilitado neste projeto.";
  return "Não foi possível concluir. Tente novamente.";
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/dashboard` },
  });
  if (error) throw error;
}
