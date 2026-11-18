import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Crosshair,
  FileUp,
  FolderHeart,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plug,
  Search,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePersistentState, useTheme, type ThemeMode } from "@/lib/theme";
import { setSearchResultsNavigator, useSearchStore } from "@/lib/search-store";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/busca", label: "Pesquisar leads", icon: Search },
  { to: "/leads", label: "Meus leads", icon: Users },
  { to: "/kanban", label: "Kanban", icon: Columns3 },
  { to: "/colecoes", label: "Coleções", icon: FolderHeart },
  { to: "/importar", label: "Importar / Exportar", icon: FileUp },
  { to: "/integracoes", label: "Integrações de API", icon: Plug },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold text-sidebar-primary-foreground shadow-md">
        <Crosshair className="h-5 w-5" />
      </div>
      {!compact && (
        <span className="font-display text-lg font-bold text-sidebar-accent-foreground">
          Lead<span className="text-sidebar-primary">Hunter</span>
        </span>
      )}
    </div>
  );
}

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  // A search keeps running while the user is on other pages: show it on its menu item.
  const searching = useSearchStore().status === "running";
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Principal">
      {NAV.map(({ to, label, icon: Icon }) => {
        const link = (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors duration-150",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              collapsed && "justify-center px-0",
            )}
            activeProps={{
              className:
                "bg-sidebar-accent text-sidebar-primary before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-sidebar-primary",
              "aria-current": "page",
            }}
          >
            <Icon className="h-5 w-5 shrink-0 transition-transform duration-150 group-hover:scale-110" />
            {!collapsed && <span className="truncate">{label}</span>}
            {collapsed && <span className="sr-only">{label}</span>}
            {to === "/busca" && searching && (
              <span
                className={cn(
                  "text-sidebar-primary",
                  collapsed ? "absolute right-2 top-1.5" : "ml-auto",
                )}
                title="Busca em andamento"
              >
                <Loader2 className={cn("animate-spin", collapsed ? "h-3 w-3" : "h-4 w-4")} />
                <span className="sr-only">(busca em andamento)</span>
              </span>
            )}
          </Link>
        );
        return collapsed ? (
          <Tooltip key={to}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

const THEME_OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

function AccountMenu({ email, collapsed }: { email: string; collapsed: boolean }) {
  const { mode, dark, setMode } = useTheme();
  const navigate = useNavigate();
  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          collapsed && "justify-center",
        )}
        aria-label="Menu da conta"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sidebar-accent font-semibold uppercase text-sidebar-primary">
          {email.slice(0, 1) || "?"}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-sidebar-foreground">{email}</span>
        )}
        {!collapsed &&
          (dark ? <Moon className="h-4 w-4 opacity-60" /> : <Sun className="h-4 w-4 opacity-60" />)}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Tema</DropdownMenuLabel>
        {THEME_OPTIONS.map((t) => (
          <DropdownMenuItem
            key={t.id}
            onSelect={() => setMode(t.id)}
            className={cn(mode === t.id && "font-semibold text-primary")}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {mode === t.id && <span className="ml-auto text-xs">✓</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/configuracoes">
            <Settings className="h-4 w-4" />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => void logout()}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children, email }: { children: ReactNode; email: string }) {
  const [collapsed, setCollapsed] = usePersistentState("lh-sidebar-collapsed", false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    setSearchResultsNavigator(() => void navigate({ to: "/busca" }));
    return () => setSearchResultsNavigator(null);
  }, [navigate]);

  return (
    <TooltipProvider delayDuration={200}>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <div className="flex min-h-dvh bg-background">
        {/* Desktop / tablet sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out md:flex",
            collapsed ? "w-[76px]" : "w-64",
          )}
        >
          <div
            className={cn(
              "flex h-16 items-center border-b border-sidebar-border px-4",
              collapsed && "justify-center px-0",
            )}
          >
            <Brand compact={collapsed} />
          </div>
          <NavLinks collapsed={collapsed} />
          <div className="space-y-1 border-t border-sidebar-border p-3">
            <AccountMenu email={email} collapsed={collapsed} />
            <button
              onClick={() => setCollapsed(!collapsed)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                collapsed && "justify-center px-0",
              )}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              aria-expanded={!collapsed}
            >
              {collapsed ? (
                <ChevronsRight className="h-5 w-5" />
              ) : (
                <ChevronsLeft className="h-5 w-5" />
              )}
              {!collapsed && "Recolher"}
            </button>
          </div>
        </aside>

        {/* Mobile drawer (focus-trapped, closes with Esc) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="flex w-72 flex-col border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
          >
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <div className="flex h-16 items-center border-b border-sidebar-border px-4">
              <Brand />
            </div>
            <NavLinks collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="border-t border-sidebar-border p-3">
              <AccountMenu email={email} collapsed={false} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="-ml-1 grid h-10 w-10 place-items-center rounded-lg outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Abrir menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="flex-1 font-display font-bold">
              Lead<span className="text-primary">Hunter</span>
            </span>
            <ThemeToggle />
          </header>
          <main
            id="conteudo"
            tabIndex={-1}
            className="min-w-0 flex-1 overflow-x-clip px-4 py-5 outline-none sm:px-6 md:px-8 md:py-8"
          >
            <div key={pathname} className="mx-auto w-full max-w-[1400px] animate-page-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon: Icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: typeof Search;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground sm:grid">
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold md:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        {/* On phones the toggle lives in the sticky top bar instead. */}
        <ThemeToggle className="hidden md:grid" />
      </div>
    </div>
  );
}
