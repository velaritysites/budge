import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";
import { markAllRead, useNotifications } from "@/lib/notify";

function ago(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

export function NotificationBell({ className = "" }: { className?: string }) {
  const { data: items = [] } = useNotifications();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await markAllRead();
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={toggle}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
      >
        <Bell className="size-[17px]" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-alert px-1 font-mono text-[9px] font-bold leading-4 text-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="panel absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(360px,86vw)] overflow-y-auto p-2 shadow-2xl">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="label-xs">Notifications</span>
            {items.length > 0 && <Check className="size-3 text-muted-foreground" />}
          </div>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
              Nothing yet. Loot will nudge you when something changes.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((n) => {
                const inner = (
                  <div
                    className={`rounded-xl border border-hairline p-3 transition-colors hover:bg-surface-2 ${
                      n.read_at ? "" : "bg-accent/[0.06]"
                    }`}
                  >
                    <p className="text-[12px] font-semibold">{n.title}</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{n.body}</p>
                    <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70">
                      {ago(n.created_at)}
                    </p>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link to={n.link} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
