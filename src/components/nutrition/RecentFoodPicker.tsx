"use client";

import { Button } from "@/components/ui/Button";
import { RECENT_FOOD_VISIBLE_COUNT } from "@/lib/nutrition-usuals";

export type RecentFoodChoice = {
  id: string;
  title: string;
  detail: string;
  /** Informational only. Does not block selection. */
  note?: string;
  disabled?: boolean;
};

type RecentFoodPickerProps = {
  label: string;
  items: RecentFoodChoice[];
  selectedIds: string[];
  busy: boolean;
  onToggle: (id: string) => void;
  onAdd: () => void;
  /** Opens the saved-food editor. Does not select the row. */
  onEdit?: (id: string) => void;
  /** Keep the add button on screen while the page scrolls. */
  pinAction?: boolean;
};

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        d="M4 20h4.2L19.5 8.7a1.8 1.8 0 0 0 0-2.5l-1.7-1.7a1.8 1.8 0 0 0-2.5 0L4 15.8V20Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

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
  onEdit,
  pinAction = false,
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
            <li
              key={item.id}
              className={`flex items-stretch border-b border-border/70 last:border-b-0 ${
                checked ? "bg-primary/10" : ""
              }`}
            >
              <label className="flex min-h-[3.5rem] min-w-0 flex-1 items-start gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={checked}
                  disabled={busy || item.disabled}
                  onChange={() => onToggle(item.id)}
                />
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] text-foreground">
                      {item.title}
                    </span>
                    {item.note ? (
                      <span className="shrink-0 text-[11px] font-medium text-muted">
                        {item.note}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-[12px] leading-5 text-muted">
                    {item.detail}
                  </span>
                </span>
              </label>
              {onEdit ? (
                <button
                  type="button"
                  aria-label={`Edit ${item.title}`}
                  title={`Edit ${item.title}`}
                  disabled={busy}
                  onClick={() => onEdit(item.id)}
                  className="mr-1 flex size-11 shrink-0 items-center justify-center self-center rounded-xl text-muted hover:bg-background hover:text-foreground disabled:opacity-60"
                >
                  <PencilIcon />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Button
        className={`mt-3 w-full ${
          pinAction
            ? "sticky bottom-24 z-10 shadow-[0_8px_20px_rgb(36_43_51/0.12)] sm:bottom-6"
            : ""
        }`}
        disabled={busy || count === 0}
        onClick={onAdd}
      >
        {addItemsLabel(count, busy)}
      </Button>
    </div>
  );
}
