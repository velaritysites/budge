import { Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type LootSelectOption = { value: string; label: string };
export type LootSelectGroup = { label?: string; options: LootSelectOption[] };

export function LootSelect({
  value,
  onValueChange,
  options,
  groups,
  placeholder,
  className,
  ariaLabel,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  options?: LootSelectOption[];
  groups?: LootSelectGroup[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const resolvedGroups = groups ?? [{ options: options ?? [] }];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("loot-select", className)} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="loot-select-menu">
        {resolvedGroups.map((group, index) => (
          <SelectGroup key={group.label ?? index}>
            {group.label && <SelectLabel className="loot-select-label">{group.label}</SelectLabel>}
            {group.options.map((option) => (
              <SelectItem key={option.value} value={option.value} className="loot-select-item">
                <span>{option.label}</span>
                <Check className="loot-select-check size-3.5" />
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}