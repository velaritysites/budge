type LootLogoProps = {
  collapsed?: boolean;
  className?: string;
  iconClassName?: string;
};

export function LootMark({ className = "size-11" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-foreground/80 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" className="h-[62%] w-[62%]" fill="none">
        <path d="M10 38 36 12M19 10c6 5 13 7 21 2-4 8-4 17 1 24" stroke="currentColor" strokeWidth="7" strokeLinecap="square" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function LootLogo({ collapsed = false, className = "", iconClassName }: LootLogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} aria-label="Loot — Know your loot.">
      <LootMark className={iconClassName} />
      {!collapsed && (
        <span className="flex flex-col leading-none">
          <span className="text-[1.55rem] font-bold text-foreground">Loot</span>
          <span className="mt-1 text-[10px] font-semibold">
            <span className="text-secondary">Know your</span>{" "}
            <span className="text-primary">loot.</span>
          </span>
        </span>
      )}
    </span>
  );
}