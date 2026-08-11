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

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/checker", label: "Checker", icon: Sparkles },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/planner", label: "Planner", icon: Calculator },
  { to: "/compare", label: "Compare", icon: GitCompare },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/settings", label: "Settings", icon: Settings },
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
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src={logo} alt="Budge" className="size-7 rounded-sm" />
          <span className="font-mono text-xs font-bold uppercase tracking-tight">Budge</span>
        </Link>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2">
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      <nav className={`${mobileOpen ? "flex" : "hidden"} md:flex w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-border p-6 flex-col gap-8 md:min-h-screen`}>
        <Link to="/dashboard" className="hidden md:flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <img src={logo} alt="Budge" className="size-9 rounded-sm" />
          <span className="font-mono text-sm tracking-tight font-bold uppercase">Budge</span>
        </Link>

        <div className="flex flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="group flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface transition-colors data-[status=active]:bg-surface data-[status=active]:text-foreground"
                activeOptions={{ exact: false }}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto pt-6 border-t border-border flex items-center gap-3">
          <div className="size-9 rounded-full bg-surface border border-border flex items-center justify-center font-mono text-[10px] font-bold">
            {initials}
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-xs font-medium truncate">{profile?.display_name ?? "You"}</span>
            <span className="text-[10px] text-muted-foreground truncate">{profile?.currency_code}</span>
          </div>
          <button onClick={toggleTheme} className="p-1.5 rounded hover:bg-surface text-muted-foreground" title="Toggle theme">
            {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
          </button>
          <button onClick={signOut} className="p-1.5 rounded hover:bg-surface text-muted-foreground" title="Sign out">
            <LogOut className="size-3.5" />
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
