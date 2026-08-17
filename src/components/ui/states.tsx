import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/* ---------------- Skeleton primitives ---------------- */

export function SkeletonLine({ w = "100%", h = 10, className = "" }: { w?: string | number; h?: number; className?: string }) {
  return <div className={`skeleton skeleton-text ${className}`} style={{ width: w, height: h }} />;
}

export function SkeletonBlock({ h = 120, className = "" }: { h?: number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, borderRadius: "var(--radius-xl)" }} />;
}

/** Full dashboard loading state — mirrors the real layout so nothing jumps on load. */
export function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col animate-fade">
      <header className="flex h-16 items-center justify-between border-b border-hairline px-6 md:px-8">
        <SkeletonLine w={190} h={11} />
        <div className="flex items-center gap-6">
          <SkeletonLine w={70} h={11} />
          <SkeletonLine w={54} h={11} />
        </div>
      </header>
      <div className="grid grid-cols-1 gap-5 p-5 md:p-8 xl:grid-cols-12">
        <section className="panel-raised relative overflow-hidden p-7 md:p-10 xl:col-span-8">
          <SkeletonLine w={140} h={9} />
          <div className="skeleton mt-5 h-16 w-[62%] rounded-2xl" />
          <div className="mt-6 flex gap-3">
            <SkeletonLine w={110} h={22} />
            <SkeletonLine w={150} h={22} />
          </div>
          <div className="skeleton mt-9 h-2 w-full rounded-full" />
        </section>
        <SkeletonBlock h={232} className="xl:col-span-4" />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:col-span-8">
          <SkeletonBlock h={148} />
          <SkeletonBlock h={148} />
          <SkeletonBlock h={148} />
        </div>
        <SkeletonBlock h={300} className="xl:col-span-4" />
        <SkeletonBlock h={280} className="xl:col-span-8" />
      </div>
    </div>
  );
}

/** Planner loading state. */
export function PlannerSkeleton() {
  return (
    <div className="animate-fade space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <SkeletonLine w={120} h={9} />
          <div className="skeleton h-9 w-64 rounded-xl" />
        </div>
        <div className="flex gap-2">
          <SkeletonLine w={104} h={34} />
          <SkeletonLine w={124} h={34} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <SkeletonBlock h={260} />
          <SkeletonBlock h={200} />
        </div>
        <div className="space-y-5 xl:col-span-4">
          <SkeletonBlock h={190} />
          <SkeletonBlock h={240} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Empty state ---------------- */

export type EmptyExample = { label: string; hint?: string; onClick?: () => void };

export function EmptyState({
  icon,
  title,
  description,
  steps,
  examples,
  action,
  secondary,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  steps?: string[];
  examples?: EmptyExample[];
  action?: { label: string; to?: string; onClick?: () => void };
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`page-enter relative overflow-hidden rounded-2xl border border-hairline px-6 py-10 text-center md:px-10 ${className}`}>
      <div className="pointer-events-none absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      {icon && <div className="empty-orb float-soft mx-auto size-16">{icon}</div>}
      <h3 className="font-display mt-6 text-xl font-bold tracking-tight">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>

      {steps && steps.length > 0 && (
        <ol className="mx-auto mt-7 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s}
              className="tile stagger p-4"
              style={{ animationDelay: `${80 + i * 70}ms` }}
            >
              <span className="font-mono text-[10px] tracking-[0.18em] text-accent">STEP {i + 1}</span>
              <p className="mt-2 text-[13px] leading-snug text-foreground/90">{s}</p>
            </li>
          ))}
        </ol>
      )}

      {examples && examples.length > 0 && (
        <div className="mt-7">
          <p className="label-xs">Try an example</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {examples.map((ex) => (
              <button key={ex.label} type="button" onClick={ex.onClick} className="chip" title={ex.hint}>
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {action && (
        <div className="mt-8 flex justify-center">
          {action.to ? (
            <Link to={action.to} className="btn-accent px-6">{action.label}</Link>
          ) : (
            <button type="button" onClick={action.onClick} className="btn-accent px-6">{action.label}</button>
          )}
        </div>
      )}
      {secondary && <div className="mt-4 text-xs text-muted-foreground">{secondary}</div>}
    </div>
  );
}
