import { createFileRoute, Outlet, redirect, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useEffect, useState } from "react";
import { LayoutDashboard, Sparkles, BarChart3, Target, Settings, Wallet, LogOut, Menu, X, Sun, Moon, Calculator, GitCompare, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import logo from "@/assets/budge-logo.png";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthLayout,
});

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/stats", label: "Stats", icon: BarChart3 },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/expenses", label: "Expenses", icon: Wallet },
      { to: "/goals", label: "Goals", icon: Target },
      { to: "/checker", label: "Checker", icon: Sparkles },
    ],
  },
  {
    label: "Planning",
    items: [
      { to: "/planner", label: "Planner", icon: Calculator },
      { to: "/compare", label: "Compare", icon: GitCompare },
    ],
  },
] as const;

function AuthLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile, isLoading } = useProfile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = (localStorage.getItem("theme") as "dark" | "light") || "dark";
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && profile && !profile.onboarded_at && location.pathname !== "/onboarding") {
      navigate({ to: "/onboarding" });
    }
  }, [profile, isLoading, location.pathname, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  }

  const initials = (profile?.display_name || "U").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Mobile bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-hairline bg-background/80 backdrop-blur-xl">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <img src={logo} alt="Budge" className="size-7 rounded-md" />
          <span className="font-display text-sm font-bold tracking-tight">Budge</span>
        </Link>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-ghost !p-2">
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </header>

      {/* Sidebar */}
      <nav
        data-collapsed={collapsed ? "true" : "false"}
        className={`${mobileOpen ? "flex" : "hidden"} group/nav relative md:flex w-full ${collapsed ? "md:w-[78px]" : "md:w-[264px]"} shrink-0 flex-col gap-7 p-4 md:p-5
          border-b md:border-b-0 md:border-r border-hairline
          md:sticky md:top-0 md:h-screen
          transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          bg-[linear-gradient(180deg,color-mix(in_oklab,var(--surface-2)_70%,var(--background)),color-mix(in_oklab,var(--surface)_45%,var(--background)))]
          backdrop-blur-xl`}
      >
        {/* Collapse toggle (desktop) */}
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-8 z-30 hidden size-6 place-items-center rounded-full border border-border bg-surface-2 text-muted-foreground shadow-[0_6px_18px_-8px_hsl(240_60%_2%/0.9)] transition-all duration-200 hover:border-accent/40 hover:text-accent md:grid"
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>

        <Link
          to="/dashboard"
          className={`hidden md:flex items-center gap-3 pt-2 ${collapsed ? "justify-center px-0" : "px-2"}`}
          onClick={() => setMobileOpen(false)}
        >
          <span className="relative shrink-0">
            <img src={logo} alt="Budge" className="size-9 rounded-xl" />
            <span className="absolute -inset-1.5 rounded-2xl bg-accent/25 blur-lg -z-10" />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-col leading-none">
              <span className="font-display text-[15px] font-bold tracking-tight">Budge</span>
              <span className="mt-1 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Calm money
              </span>
            </span>
          )}
        </Link>

        <div className="flex flex-col gap-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              {collapsed ? (
                <span className="mx-auto mb-1 h-px w-6 bg-[var(--hairline)] md:block hidden" />
              ) : (
                <span className="px-3 pb-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
                  {group.label}
                </span>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                    activeOptions={{ exact: false }}
                    className={`group relative flex items-center gap-3 overflow-hidden rounded-xl py-2.5 text-[13px] font-medium text-muted-foreground
                      ${collapsed ? "md:justify-center md:px-0 px-4" : "px-4"}
                      transition-all duration-200 hover:text-foreground hover:bg-surface-2/70
                      data-[status=active]:text-foreground
                      data-[status=active]:bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent)_22%,transparent),transparent)]
                      data-[status=active]:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_26%,transparent)]`}
                  >
                    <span className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300 group-data-[status=active]:h-5" />
                    <Icon className="size-[17px] shrink-0 opacity-40 transition-opacity group-hover:opacity-70 group-data-[status=active]:text-accent group-data-[status=active]:opacity-100" />
                    <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>


        <Link
          to="/expenses"
          onClick={() => setMobileOpen(false)}
          title={collapsed ? "New expense" : undefined}
          className={`btn-cta ${collapsed ? "md:!px-0" : ""}`}
        >
          <Plus className="size-4 shrink-0" strokeWidth={3} />
          <span className={collapsed ? "md:hidden" : ""}>New expense</span>
        </Link>


        <div className="mt-auto">
          <Link
            to="/settings"
            onClick={() => setMobileOpen(false)}
            title={collapsed ? "Settings" : undefined}
            className={`mb-3 flex items-center gap-3 rounded-lg py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-surface-2 data-[status=active]:text-foreground ${collapsed ? "md:justify-center md:px-0 px-3" : "px-3"}`}
          >
            <Settings className="size-[15px] shrink-0 opacity-70" />
            <span className={collapsed ? "md:hidden" : ""}>Settings</span>
          </Link>

          <div className={`panel flex items-center gap-3 p-3 ${collapsed ? "md:flex-col md:gap-2 md:p-2" : ""}`}>
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/12 font-mono text-[10px] font-bold text-accent">
              {initials}
            </div>
            <div className={`flex min-w-0 flex-1 flex-col ${collapsed ? "md:hidden" : ""}`}>
              <span className="truncate text-xs font-semibold">{profile?.display_name ?? "You"}</span>
              <span className="truncate font-mono text-[10px] tracking-wider text-muted-foreground">
                {profile?.currency_code}
              </span>
            </div>
            <button onClick={toggleTheme} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground" title="Toggle theme">
              {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
            <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-alert" title="Sign out">
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </nav>


      <main className="aura min-w-0 flex-1">
        <div key={location.pathname} className="animate-fade">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
