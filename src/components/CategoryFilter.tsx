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
      className="flex gap-2 w-full"
    >
      {CATEGORIES.map((cat) => (
        <ToggleGroupItem
          key={cat.id}
          value={cat.id}
          aria-label={cat.label}
          title={cat.description}
          className="flex-1 rounded-full px-3 py-2 text-xs font-medium cursor-pointer transition-all duration-150 border border-slate-300 bg-slate-100 shadow-[0_3px_0_0_#94a3b8] hover:-translate-y-0.5 hover:shadow-[0_4px_0_0_#94a3b8] active:translate-y-0.5 active:shadow-[0_1px_0_0_#94a3b8] data-[state=on]:translate-y-0.5 data-[state=on]:shadow-[0_1px_0_0_#1e293b] data-[state=on]:bg-slate-900 data-[state=on]:text-white data-[state=on]:border-slate-900"
        >
          {cat.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
