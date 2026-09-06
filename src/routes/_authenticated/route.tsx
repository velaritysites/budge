import { createFileRoute, Outlet, redirect, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useEffect, useState } from "react";
import { LayoutDashboard, Sparkles, BarChart3, Target, Settings, Wallet, LogOut, Menu, X, Calculator, GitCompare, Plus, FileSearch, Landmark, ReceiptText } from "lucide-react";
import { useOpenAlerts } from "@/lib/alerts";
import { NotificationBell } from "@/components/notification-bell";
import { AssistantLauncher, AssistantTabButton } from "@/components/assistant";
import { LootLogo } from "@/components/LootLogo";

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
      { to: "/statement", label: "Statement Analysis", icon: FileSearch },

    ],
  },
  {
    label: "Planning",
    items: [
      { to: "/planner", label: "Planner", icon: Calculator },
      { to: "/compare", label: "Compare", icon: GitCompare },
      { to: "/tax", label: "Tax", icon: Landmark },
    ],
  },
] as const;

const BOTTOM_NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/expenses", label: "Expenses", icon: Wallet },
  { to: "/statement", label: "Statement", icon: FileSearch },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/stats", label: "Stats", icon: BarChart3 },
] as const;

function AuthLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: profile, isLoading } = useProfile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(() => {
    if (typeof document !== "undefined") {
      const cookie = document.cookie.split("; ").find((row) => row.startsWith("sidebar_state="));
      return cookie ? cookie.split("=")[1] === "true" : true;
    }
    return true;
  });

  const toggleDesktop = () => {
    const next = !desktopOpen;
    setDesktopOpen(next);
    document.cookie = `sidebar_state=${next}; path=/; max-age=${60 * 60 * 24 * 7}`;
  };
  const { data: openAlerts = [] } = useOpenAlerts();
  const alertCount = openAlerts.length;

  useEffect(() => {
    if (!isLoading && profile && !profile.onboarded_at && location.pathname !== "/onboarding") {
      navigate({ to: "/onboarding" });
    }
  }, [profile, isLoading, location.pathname, navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.display_name || "U").slice(0, 2).toUpperCase();
  const navItems = NAV_GROUPS.flatMap((group) => [...group.items]);
  const pageTitle = location.pathname === "/dashboard" ? null : navItems.find((item) => item.to === location.pathname)?.label ?? (location.pathname === "/settings" ? "Settings" : "Loot");
  const firstName = (profile?.display_name ?? "there").trim().split(" ")[0] || "there";
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Mobile bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-hairline bg-background/80 backdrop-blur-xl">
        <Link to="/dashboard"><LootLogo iconClassName="size-8" /></Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
        <button onClick={() => setMobileOpen(!mobileOpen)} className="btn-ghost !p-2">
          {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
        </div>
      </header>

      {/* Sidebar */}
      <nav
        className={`${mobileOpen ? "flex" : "hidden"} md:flex w-full ${desktopOpen ? "md:w-[264px]" : "md:w-[80px]"} shrink-0 flex-col gap-7 p-4 ${desktopOpen ? "md:p-5" : "md:p-3"} transition-[width,padding] duration-300
          border-b md:border-b-0 md:border-r border-hairline
          md:sticky md:top-0 md:h-screen
          bg-background`}>
        <div className="hidden md:flex justify-end px-2">
          <button onClick={toggleDesktop} className="btn-ghost !p-1.5 opacity-50 hover:opacity-100">
            <Menu className="size-4" />
          </button>
        </div>
        <Link to="/dashboard" className="hidden md:flex px-2 pt-3" onClick={() => setMobileOpen(false)}><LootLogo iconClassName="size-11" collapsed={!desktopOpen} /></Link>

        <div className="flex flex-col gap-6">
          {NAV_GROUPS.map((group) => (
            <div key={desktopOpen ? group.label : ""} className="flex flex-col gap-1">
              <span className="px-3 pb-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60">
                {desktopOpen ? group.label : ""}
              </span>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    activeOptions={{ exact: false }}
                    className="group relative flex items-center gap-3 overflow-hidden rounded-r-lg px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-all duration-150 hover:bg-foreground/[0.04] hover:text-foreground data-[status=active]:bg-primary/[0.08] data-[status=active]:font-semibold data-[status=active]:text-foreground"
                  >
                    <span className="absolute left-0 top-1/2 h-0 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300 group-data-[status=active]:h-5" />
                    <Icon className="size-[17px] opacity-40 transition-opacity group-hover:opacity-70 group-data-[status=active]:text-accent group-data-[status=active]:opacity-100" />
                    {desktopOpen && item.label}
                    {item.to === "/statement" && alertCount > 0 && (
                      <span className="ml-auto flex size-[18px] items-center justify-center rounded-full bg-caution/20 font-mono text-[10px] font-bold text-caution">
                        {alertCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>


        <div className={`loot-promo ${!desktopOpen ? "hidden" : ""}`}>
          <ReceiptText className="size-5 text-primary" />
          <p className="mt-2 text-sm font-bold">Add an expense</p>
          <p className="mt-1 text-xs text-muted-foreground">Have an expense, you would like to add?</p>
          <Link to="/expenses" search={{ add: "1" } as never} onClick={() => setMobileOpen(false)} className="btn-primary mt-3 w-full !py-2 text-xs">
            <Plus className="size-3.5" /> New expense
          </Link>
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

          <Link to="/settings" className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-foreground/[0.04]">
            <div className="grid size-10 shrink-0 place-items-center rounded-full border border-secondary bg-secondary/20 text-xs font-bold text-secondary">
              {initials}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-semibold">{{desktopOpen && (profile?.display_name ?? "You")}}</span>
              <span className="truncate text-[10px] text-muted-foreground">Profile &amp; settings</span>
            </div>
          </Link>
          <button onClick={signOut} className="mt-3 flex w-full items-center gap-3 border-t border-border px-3 pt-4 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      </nav>

      <AssistantLauncher />

      <main className="loot-main min-w-0 flex-1 pb-16 md:pb-0">
        <header className="loot-topbar">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold md:text-[28px]">{pageTitle ?? `${greeting}, ${firstName} 👋`}</h1>
            {location.pathname === "/dashboard" && <p className="mt-0.5 text-sm text-foreground/65">Here’s what’s happening with your loot.</p>}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <NotificationBell />
            <Link to="/checker" className="btn-secondary hidden sm:inline-flex"><Sparkles className="size-4" /> Run a check</Link>
            <Link to="/expenses" search={{ add: "1" } as never} className="btn-primary"><Plus className="size-4" /> <span className="hidden sm:inline">Add expense</span></Link>
          </div>
        </header>
        <div key={location.pathname} className="loot-content animate-fade">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-6 border-t border-hairline bg-background/85 backdrop-blur-xl md:hidden">
        {BOTTOM_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium text-muted-foreground transition-colors data-[status=active]:text-accent"
            >
              <Icon className="size-[18px]" />
              {desktopOpen && item.label}
            </Link>
          );
        })}
        <AssistantTabButton />
      </nav>
    </div>
  );
}
