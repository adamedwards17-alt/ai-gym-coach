"use client";

import { useState } from "react";

type Option = { id: string; label: string };

type MultiOptionSelectorProps = {
  name: string;
  options: readonly Option[];
  value: string[];
  onContinue: (ids: string[]) => void;
};

export function MultiOptionSelector({
  name,
  options,
  value,
  onContinue,
}: MultiOptionSelectorProps) {
  const [selectedIds, setSelectedIds] = useState(value);

  return (
    <div className="today-reveal">
      <div className="flex flex-wrap gap-2" role="group" aria-label={name}>
        {options.map((option) => {
          const selected = selectedIds.includes(option.id);

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setSelectedIds(
                  selected
                    ? selectedIds.filter((id) => id !== option.id)
                    : [...selectedIds, option.id],
                );
              }}
              className={`min-h-11 rounded-full border px-4 py-2.5 text-left text-[14px] transition-colors ${
                selected
                  ? "border-white/20 bg-white/8 text-foreground"
                  : "border-border text-muted hover:border-white/12 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {selectedIds.length > 0 ? (
        <button
          type="button"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
          onClick={() => onContinue(selectedIds)}
        >
          Continue
        </button>
      ) : null}
    </div>
  );
}
