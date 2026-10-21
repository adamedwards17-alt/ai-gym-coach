"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { searchRecentNutritionEntries } from "@/app/actions/nutrition";
import {
  entryDisplayTitle,
  formatEntryNutritionLine,
  getLocalLoggedDate,
  type MealTypeId,
  type NutritionEntryRecord,
} from "@/lib/nutrition";

type NutritionDescriptionInputProps = {
  label: string;
  placeholder?: string;
  initialValue?: string;
  /** When false, autocomplete suggestions are hidden (describe-only mode). */
  enableSuggestions?: boolean;
  /** Prefer foods previously logged in this meal category. */
  mealType?: MealTypeId | null;
  /** Search every saved food, including ones logged under another meal. */
  searchAllCategories?: boolean;
  /** Optional trailing controls inside the input (barcode / camera). */
  trailingActions?: ReactNode;
  onSubmit: (description: string) => void;
  onSelectSuggestion: (entry: NutritionEntryRecord) => void;
};

export function NutritionDescriptionInput({
  label,
  placeholder,
  initialValue = "",
  enableSuggestions = true,
  mealType = null,
  searchAllCategories = false,
  trailingActions,
  onSubmit,
  onSelectSuggestion,
}: NutritionDescriptionInputProps) {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<NutritionEntryRecord[]>([]);
  const [open, setOpen] = useState(false);

  const runSearch = useEffectEvent(async (query: string) => {
    if (!enableSuggestions || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const result = await searchRecentNutritionEntries({
      query,
      localDate: getLocalLoggedDate(),
      mealType,
      searchAllCategories: searchAllCategories || !mealType,
    });

    if (result.status === "ok") {
      setSuggestions(result.entries);
      setOpen(result.entries.length > 0);
    }
  });

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runSearch(value);
    }, 180);
    return () => window.clearTimeout(handle);
  }, [value, enableSuggestions, mealType, searchAllCategories]);

  return (
    <form
      className="today-reveal relative"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }
        setOpen(false);
        const match = suggestions.find((entry) => {
          const description = entry.description.trim().toLowerCase();
          const title = entryDisplayTitle(entry).trim().toLowerCase();
          const needle = trimmed.toLowerCase();
          return description === needle || title === needle;
        });
        if (match) {
          onSelectSuggestion(match);
          return;
        }
        onSubmit(trimmed);
      }}
    >
      <div className="flex h-12 items-center gap-1 rounded-xl border border-border bg-surface pl-3.5 pr-1 focus-within:border-primary">
        <input
          aria-label={label}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted"
          onChange={(event) => {
            setValue(event.target.value);
            if (enableSuggestions) {
              setOpen(true);
            }
          }}
          onFocus={() => {
            if (enableSuggestions && suggestions.length > 0) {
              setOpen(true);
            }
          }}
        />
        {trailingActions ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {trailingActions}
          </div>
        ) : null}
      </div>

      {enableSuggestions && open && suggestions.length > 0 ? (
        <ul
          className="mt-2 max-h-[min(16rem,40vh)] overflow-y-auto rounded-xl border border-border bg-surface"
          role="listbox"
          aria-label="Saved foods"
        >
          {suggestions.map((entry) => {
            const title = entryDisplayTitle(entry);
            const showSubtitle =
              entry.display_name &&
              entry.display_name.trim().toLowerCase() !==
                entry.description.trim().toLowerCase();
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full flex-col justify-center gap-0.5 px-3.5 py-2.5 text-left transition-colors hover:bg-primary/5"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    onSelectSuggestion(entry);
                  }}
                >
                  <span className="text-[14px] text-foreground">{title}</span>
                  {showSubtitle ? (
                    <span className="text-[12px] text-muted">
                      {entry.description}
                    </span>
                  ) : null}
                  <span className="text-[12px] text-muted">
                    {formatEntryNutritionLine(entry) ?? "Previously logged"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {value.trim() ? (
        <button
          type="submit"
          className="mt-2 inline-flex h-11 items-center text-[14px] font-medium text-primary"
        >
          Continue
        </button>
      ) : null}
    </form>
  );
}
