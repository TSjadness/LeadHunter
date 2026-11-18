import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import * as s from "./styles";

/** One-click light/dark switch. The choice is saved in localStorage and restored on load. */
export function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useTheme();
  const label = dark ? "Ativar tema claro" : "Ativar tema escuro";
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(s.toggleButton, className)}
      aria-label={label}
      title={label}
      aria-pressed={dark}
    >
      <Sun className={cn(s.icon, dark ? s.iconHidden : s.iconShown)} aria-hidden />
      <Moon className={cn(s.icon, dark ? s.iconShown : s.iconHidden)} aria-hidden />
    </button>
  );
}
