"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORIES, type CategoryId } from "@/config/filters";

interface CategoryFilterProps {
  selected: CategoryId[];
  onChange: (selected: CategoryId[]) => void;
}

export default function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <ToggleGroup
      type="multiple"
      value={selected}
      onValueChange={(value: string[]) => {
        // Prevent deselecting all — at least one must remain
        if (value.length === 0) return;
        onChange(value as CategoryId[]);
      }}
      className="flex flex-wrap gap-2 justify-start"
    >
      {CATEGORIES.map((cat) => (
        <ToggleGroupItem
          key={cat.id}
          value={cat.id}
          aria-label={cat.label}
          className="rounded-full px-3 py-1 text-xs font-medium border border-slate-300 data-[state=on]:bg-slate-900 data-[state=on]:text-white data-[state=on]:border-slate-900 hover:bg-slate-100"
        >
          {cat.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
