import {
  Home, Car, CreditCard, Shield, Heart, Landmark,
  ShoppingCart, UtensilsCrossed, Coffee, Package,
  ShoppingBag, Sparkles, Repeat, Clapperboard, Laptop, Phone,
  Gift, GraduationCap, Baby, PawPrint,
  PiggyBank, TrendingUp, Briefcase,
  Plane, FileText, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORY_MAP,
  GROUPED_CATEGORIES,
  normalizeCategory,
  type ExpenseCategory,
} from "@/lib/categories";
import { LootSelect } from "@/components/ui/loot-select";

const ICONS: Record<string, LucideIcon> = {
  Home, Car, CreditCard, Shield, Heart, Landmark,
  ShoppingCart, UtensilsCrossed, Coffee, Package,
  ShoppingBag, Sparkles, Repeat, Clapperboard, Laptop, Phone,
  Gift, GraduationCap, Baby, PawPrint,
  PiggyBank, TrendingUp, Briefcase,
  Plane, FileText, MoreHorizontal,
};

export function categoryIcon(category: string): LucideIcon {
  return ICONS[CATEGORY_MAP[normalizeCategory(category)].icon] ?? MoreHorizontal;
}

/** Grouped <optgroup> options for any native category <select>. */
export function CategoryOptions() {
  return (
    <>
      {GROUPED_CATEGORIES.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function CategoryLootSelect({ value, onValueChange, className, placeholder = "Choose category", ariaLabel = "Category" }: {
  value?: string;
  onValueChange: (value: ExpenseCategory) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <LootSelect
      value={value}
      onValueChange={(next) => onValueChange(next as ExpenseCategory)}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className={className}
      groups={GROUPED_CATEGORIES.map((group) => ({
        label: group.group,
        options: group.items.map((item) => ({ value: item.key, label: item.label })),
      }))}
    />
  );
}

export function CategoryIcon({
  category,
  className = "size-4",
}: {
  category: string;
  className?: string;
}) {
  const Icon = categoryIcon(category);
  return <Icon className={className} />;
}

/** Round icon chip tinted with the category colour. */
export function CategoryAvatar({
  category,
  className = "",
}: {
  category: string;
  className?: string;
}) {
  const def = CATEGORY_MAP[normalizeCategory(category)];
  const Icon = categoryIcon(category);
  return (
    <span
      className={`avatar-cat ${className}`}
      style={{
        backgroundColor: `color-mix(in oklab, ${def.color} 16%, transparent)`,
        color: def.color,
        borderColor: `color-mix(in oklab, ${def.color} 30%, transparent)`,
      }}
    >
      <Icon className="size-4" />
    </span>
  );
}

export type { ExpenseCategory };
