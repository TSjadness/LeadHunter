import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "lh-theme";

/** Inline script for <head>: applies the theme before first paint (no flash). */
export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem('${KEY}')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(mode: ThemeMode, animate: boolean) {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "system" && systemDark());
  // Short, global colour cross-fade on user toggles only (never on first paint). The CSS
  // disables it under prefers-reduced-motion.
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 320);
  }
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  return dark;
}

// One shared store, so every toggle/menu on screen reflects the same theme instantly.
type ThemeState = { mode: ThemeMode; dark: boolean };
const SERVER_STATE: ThemeState = { mode: "system", dark: false };
let state: ThemeState | null = null;
const listeners = new Set<() => void>();
let mqBound = false;

function ensureState(): ThemeState {
  if (state) return state;
  const mode = readMode();
  state = { mode, dark: apply(mode, false) };
  if (!mqBound) {
    mqBound = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (state?.mode === "system") setState({ mode: "system", dark: apply("system", true) });
    });
    // Keep several tabs in sync.
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) {
        const m = readMode();
        setState({ mode: m, dark: apply(m, true) });
      }
    });
  }
  return state;
}

function setState(next: ThemeState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function setThemeMode(m: ThemeMode) {
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* private mode: theme just won't persist */
  }
  setState({ mode: m, dark: apply(m, true) });
}

export function useTheme() {
  const { mode, dark } = useSyncExternalStore(subscribe, ensureState, () => SERVER_STATE);
  const setMode = useCallback((m: ThemeMode) => setThemeMode(m), []);
  const toggle = useCallback(() => setThemeMode(dark ? "light" : "dark"), [dark]);
  return { mode, dark, setMode, toggle };
}

/** Small persisted UI preference (per browser). Never use for important data. */
function readStored<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function usePersistentState<T>(key: string, initial: T) {
  // Users of this hook render client-side only (the app area is `ssr: false`), so the stored
  // value can be read synchronously: no first render with the default, no extra queries.
  const [value, setValue] = useState<T>(() =>
    typeof window === "undefined" ? initial : (readStored<T>(key) ?? initial),
  );
  useEffect(() => {
    const v = readStored<T>(key);
    if (v !== undefined) setValue(v);
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set] as const;
}
