"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { searchRecentNutritionEntries } from "@/app/actions/nutrition";
import {
  entryDisplayTitle,
  formatEntryNutritionLine,
  getLocalLoggedDate,
  type NutritionEntryRecord,
} from "@/lib/nutrition";

type NutritionDescriptionInputProps = {
  label: string;
  placeholder?: string;
  initialValue?: string;
  /** When false, autocomplete suggestions are hidden (describe-only mode). */
  enableSuggestions?: boolean;
  onSubmit: (description: string) => void;
  onSelectSuggestion: (entry: NutritionEntryRecord) => void;
};

export function NutritionDescriptionInput({
  label,
  placeholder,
  initialValue = "",
  enableSuggestions = true,
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
  }, [value, enableSuggestions]);

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
        // Exact match on a recent suggestion → reuse that entry (structured editor
        // when macros exist). Only genuinely new text uses the AI flow.
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
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        className="h-12 w-full rounded-full border border-border bg-surface/60 px-4 text-[15px] text-foreground outline-none placeholder:text-muted focus:border-white/20"
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

      {enableSuggestions && open && suggestions.length > 0 ? (
        <ul
          className="absolute left-0 right-0 top-[3.35rem] z-20 overflow-hidden rounded-2xl border border-border/80 bg-background/95 shadow-[0_12px_40px_rgb(0_0_0/0.35)] backdrop-blur"
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
                  className="flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-white/[0.04]"
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
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
        >
          Continue
        </button>
      </div>
    </form>
  );
}
