"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORIES, type CategoryId } from "@/config/filters";

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
      className="flex flex-wrap gap-2 justify-start"
    >
      {CATEGORIES.map((cat) => (
        <ToggleGroupItem
          key={cat.id}
          value={cat.id}
          aria-label={cat.label}
          title={cat.description}
          className="rounded-full px-3 py-1 text-xs font-medium border border-slate-300 data-[state=on]:bg-slate-900 data-[state=on]:text-white data-[state=on]:border-slate-900 hover:bg-slate-100"
        >
          {cat.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
