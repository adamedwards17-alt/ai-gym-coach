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
  trailingActions,
  onSubmit,
  onSelectSuggestion,
}: NutritionDescriptionInputProps) {
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<NutritionEntryRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [searchAll, setSearchAll] = useState(false);

  const runSearch = useEffectEvent(async (query: string) => {
    if (!enableSuggestions || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const result = await searchRecentNutritionEntries({
      query,
      localDate: getLocalLoggedDate(),
      mealType,
      searchAllCategories: searchAll || !mealType,
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
  }, [value, enableSuggestions, mealType, searchAll]);

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
      <div className="flex h-12 items-center gap-1 rounded-full border border-border bg-surface pl-4 pr-1.5 focus-within:border-primary">
        <input
          aria-label={label}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
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

      {enableSuggestions && mealType ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setSearchAll((current) => !current)}
            className="text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            {searchAll
              ? "Showing all saved foods — prefer this meal?"
              : "Search all saved foods"}
          </button>
        </div>
      ) : null}

      {enableSuggestions && open && suggestions.length > 0 ? (
        <ul
          className="absolute left-0 right-0 top-[3.35rem] z-20 overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-[0_8px_24px_rgb(36_43_51/0.08)] backdrop-blur"
          role="listbox"
          aria-label="Recent foods"
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
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-primary/5"
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

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-white"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
