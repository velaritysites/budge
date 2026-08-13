import { createFileRoute, Outlet, redirect, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useEffect, useState } from "react";
import { LayoutDashboard, Sparkles, BarChart3, Target, Settings, Wallet, LogOut, Menu, X, Sun, Moon, Calculator, GitCompare } from "lucide-react";
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
        className={`${mobileOpen ? "flex" : "hidden"} md:flex w-full md:w-[264px] shrink-0 flex-col gap-7 p-4 md:p-5
          border-b md:border-b-0 md:border-r border-hairline
          md:sticky md:top-0 md:h-screen
          bg-[color-mix(in_oklab,var(--surface)_60%,var(--background))]`}
      >
        <Link to="/dashboard" className="hidden md:flex items-center gap-3 px-2 pt-2" onClick={() => setMobileOpen(false)}>
          <span className="relative">
            <img src={logo} alt="Budge" className="size-9 rounded-lg" />
            <span className="absolute -inset-1 rounded-xl bg-accent/15 blur-md -z-10" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-bold tracking-tight">Budge</span>
            <span className="mt-1 text-[9px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Calm money
            </span>
          </span>
        </Link>

        <div className="flex flex-col gap-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1">
              <span className="px-3 pb-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/70">
                {group.label}
              </span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    activeOptions={{ exact: false }}
                    className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground
                      transition-colors duration-200 hover:text-foreground hover:bg-surface-2
                      data-[status=active]:text-foreground data-[status=active]:bg-surface-2
                      data-[status=active]:shadow-[inset_0_1px_0_hsl(0_0%_100%/0.05)]"
                  >
                    <span className="absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 rounded-full bg-accent transition-all duration-300 group-data-[status=active]:h-4" />
                    <Icon className="size-[15px] opacity-70 transition-opacity group-hover:opacity-100 group-data-[status=active]:text-accent group-data-[status=active]:opacity-100" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-auto">
          <Link
            to="/settings"
            onClick={() => setMobileOpen(false)}
            className="mb-3 flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground data-[status=active]:bg-surface-2 data-[status=active]:text-foreground"
          >
            <Settings className="size-[15px] opacity-70" />
            Settings
          </Link>

          <div className="panel flex items-center gap-3 p-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/12 font-mono text-[10px] font-bold text-accent">
              {initials}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
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
        <Outlet />
      </main>
    </div>
  );
}
