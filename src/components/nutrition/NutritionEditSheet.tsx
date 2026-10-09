"use client";

import { useState } from "react";
import { entryDisplayTitle, type NutritionEntryRecord } from "@/lib/nutrition";

type NutritionEditSheetProps = {
  entry: NutritionEntryRecord;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (values: {
    description: string;
    displayName: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => void;
};

export function NutritionEditSheet({
  entry,
  saving,
  error,
  onCancel,
  onSave,
}: NutritionEditSheetProps) {
  const [displayName, setDisplayName] = useState(entryDisplayTitle(entry));
  const [description, setDescription] = useState(entry.description);
  const [calories, setCalories] = useState(
    String(entry.calories_estimated ?? 0),
  );
  const [proteinG, setProteinG] = useState(
    String(Math.round(Number(entry.protein_g_estimated ?? 0))),
  );
  const [carbsG, setCarbsG] = useState(
    String(Math.round(Number(entry.carbs_g_estimated ?? 0))),
  );
  const [fatG, setFatG] = useState(
    String(Math.round(Number(entry.fat_g_estimated ?? 0))),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-8 pt-16 sm:items-center sm:pb-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nutrition-edit-title"
        className="relative w-full max-w-md rounded-[1.75rem] border border-border bg-background p-5 shadow-[0_24px_80px_rgb(0_0_0/0.45)]"
      >
        <p
          id="nutrition-edit-title"
          className="font-serif text-[1.5rem] tracking-tight"
        >
          Edit entry
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Renaming keeps your nutrition values. Saving marks macros as manually
          edited.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Ingredients / details</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Calories", calories, setCalories],
                ["Protein (g)", proteinG, setProteinG],
                ["Carbs (g)", carbsG, setCarbsG],
                ["Fat (g)", fatG, setFatG],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">{label}</span>
                <input
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
                />
              </label>
            ))}
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-muted">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
            onClick={() =>
              onSave({
                description,
                displayName,
                calories: Number(calories),
                proteinG: Number(proteinG),
                carbsG: Number(carbsG),
                fatG: Number(fatG),
              })
            }
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            disabled={saving}
            className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
