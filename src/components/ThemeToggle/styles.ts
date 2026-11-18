// Tailwind class tokens for ThemeToggle (the project styles with Tailwind + CSS variables
// defined in src/styles.css, so light/dark colours come from the shared design tokens).
export const toggleButton =
  "relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-sm outline-none transition-[background-color,border-color,transform] duration-150 hover:bg-muted active:scale-95 focus-visible:ring-2 focus-visible:ring-ring";

export const icon =
  "absolute h-[18px] w-[18px] transition-[transform,opacity] duration-300 ease-out";
export const iconShown = "rotate-0 scale-100 opacity-100";
export const iconHidden = "rotate-90 scale-50 opacity-0";
