"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORIES, type CategoryId } from "@/config/filters";
import { Star, Gem, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<CategoryId, React.ReactNode> = {
  topspots: <Star className="size-3.5" />,
  "hidden-gems": <Gem className="size-3.5" />,
  "on-the-come-up": <TrendingUp className="size-3.5" />,
};

interface CategoryFilterProps {
  selected: CategoryId[];
  onChange: (selected: CategoryId[]) => void;
}

// TODO: Switch to type="multiple" for inclusive multi-select (union logic already supported)
// <ToggleGroup type="multiple" value={selected} onValueChange={(value: string[]) => {
//   if (value.length === 0) return; // Prevent deselecting all
//   onChange(value as CategoryId[]);
// }}>

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <ToggleGroup
      type="single"
      value={selected[0]}
      onValueChange={(value: string) => {
        // Prevent deselecting (clicking the active toggle)
        if (!value) return;
        onChange([value as CategoryId]);
      }}
      className="flex gap-2 w-full"
    >
      {CATEGORIES.map((cat) => (
        <ToggleGroupItem
          key={cat.id}
          value={cat.id}
          aria-label={cat.label}
          title={cat.description}
          className={cn(
            "flex-1 rounded-full px-2 py-2 text-xs whitespace-nowrap font-medium",
            "cursor-pointer transition-transform duration-200 ease-out",
            "border border-zinc-300 bg-zinc-100 shadow-[0_3px_0_0_var(--shadow-outline)]",
            "hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[0_1px_0_0_var(--shadow-outline)]",
            "dark:bg-zinc-800 dark:border-zinc-600 dark:text-zinc-200 dark:shadow-[0_3px_0_0_var(--shadow-outline)]",
            "dark:active:shadow-[0_1px_0_0_var(--shadow-outline)]",
            "data-[state=on]:translate-y-0.5 data-[state=on]:shadow-[0_1px_0_0_var(--shadow-primary)]",
            "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary",
            "dark:data-[state=on]:bg-primary dark:data-[state=on]:text-primary-foreground dark:data-[state=on]:border-primary dark:data-[state=on]:shadow-[0_1px_0_0_var(--shadow-primary)]",
          )}
        >
          {CATEGORY_ICONS[cat.id]} {cat.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
