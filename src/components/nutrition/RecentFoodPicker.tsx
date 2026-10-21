"use client";

import { Button } from "@/components/ui/Button";
import { RECENT_FOOD_VISIBLE_COUNT } from "@/lib/nutrition-usuals";

export type RecentFoodChoice = {
  id: string;
  title: string;
  detail: string;
  disabled?: boolean;
};

type RecentFoodPickerProps = {
  label: string;
  items: RecentFoodChoice[];
  selectedIds: string[];
  busy: boolean;
  onToggle: (id: string) => void;
  onAdd: () => void;
};

const ROW_REM = 3.5;

export function recentFoodListMaxHeight(): string {
  return `calc(${RECENT_FOOD_VISIBLE_COUNT * ROW_REM}rem + 0.25rem)`;
}

export function addItemsLabel(count: number, busy: boolean): string {
  if (busy) {
    return "Adding…";
  }
  if (count === 1) {
    return "Add 1 item";
  }
  if (count > 1) {
    return `Add ${count} items`;
  }
  return "Add items";
}

export function RecentFoodPicker({
  label,
  items,
  selectedIds,
  busy,
  onToggle,
  onAdd,
}: RecentFoodPickerProps) {
  const selected = new Set(selectedIds);
  const count = items.filter((item) => selected.has(item.id) && !item.disabled).length;

  return (
    <div>
      <ul
        aria-label={label}
        className="mt-1 overflow-y-auto overscroll-y-contain"
        style={{ maxHeight: recentFoodListMaxHeight() }}
      >
        {items.map((item) => {
          const checked = selected.has(item.id);
          return (
            <li key={item.id} className="border-b border-border/70 last:border-b-0">
              <label
                className={`flex min-h-[3.5rem] items-start gap-3 px-3 py-2 ${
                  checked ? "bg-primary/10" : ""
                } ${item.disabled ? "opacity-60" : ""}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={checked}
                  disabled={busy || item.disabled}
                  onChange={() => onToggle(item.id)}
                />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-foreground">
                    {item.title}
                  </span>
                  <span className="block truncate text-[12px] leading-5 text-muted">
                    {item.detail}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button
        className="mt-3 w-full"
        disabled={busy || count === 0}
        onClick={onAdd}
      >
        {addItemsLabel(count, busy)}
      </Button>
    </div>
  );
}
