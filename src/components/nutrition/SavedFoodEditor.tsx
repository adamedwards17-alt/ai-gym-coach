"use client";

import { useState } from "react";
import { updateSavedFood } from "@/app/actions/saved-food";
import { entryDisplayTitle, type NutritionEntryRecord } from "@/lib/nutrition";
import { formatUsualServing } from "@/lib/nutrition-usuals";
import { normalizePortions } from "@/lib/nutrition-portions";
import {
  totalsForSavedFood,
  validateSavedFood,
  type SavedFoodDefinition,
} from "@/lib/saved-food";

const fieldClass =
  "h-11 rounded-xl border border-border bg-surface px-3.5 text-[15px] text-foreground outline-none focus:border-primary";

type SavedFoodEditorProps = {
  entry: NutritionEntryRecord;
  definition: SavedFoodDefinition | null;
  onClose: () => void;
  onSaved: (food: SavedFoodDefinition) => void;
};

export function SavedFoodEditor({
  entry,
  definition,
  onClose,
  onSaved,
}: SavedFoodEditorProps) {
  const initial = definition
    ? totalsForSavedFood(definition)
    : {
        name: entryDisplayTitle(entry),
        servingLabel: formatUsualServing(entry.portions),
        defaultPortions: normalizePortions(entry.portions),
        calories: Math.round(Number(entry.calories_estimated ?? 0)),
        proteinG: Math.round(Number(entry.protein_g_estimated ?? 0) * 10) / 10,
        carbsG: Math.round(Number(entry.carbs_g_estimated ?? 0) * 10) / 10,
        fatG: Math.round(Number(entry.fat_g_estimated ?? 0) * 10) / 10,
      };
  const [name, setName] = useState(initial.name);
  const [servingLabel, setServingLabel] = useState(initial.servingLabel);
  const [defaultPortions, setDefaultPortions] = useState(String(initial.defaultPortions));
  const [calories, setCalories] = useState(String(initial.calories));
  const [proteinG, setProteinG] = useState(String(initial.proteinG));
  const [carbsG, setCarbsG] = useState(String(initial.carbsG));
  const [fatG, setFatG] = useState(String(initial.fatG));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = validateSavedFood({
      name,
      servingLabel,
      defaultPortions,
      calories,
      proteinG,
      carbsG,
      fatG,
    });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateSavedFood({
      sourceEntryId: entry.id,
      ...parsed.value,
    });
    setSaving(false);
    if (result.status !== "ok") {
      setError(result.message);
      return;
    }
    onSaved(result.food);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#242B33]/40 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-16 sm:items-center sm:pb-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={saving ? undefined : onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-food-edit-title"
        className="relative max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-[0_16px_40px_rgb(36_43_51/0.12)]"
      >
        <h2 id="saved-food-edit-title" className="text-[1.35rem] font-semibold tracking-tight">
          Edit saved food
        </h2>
        <p className="mt-1 text-[13px] leading-6 text-muted">
          This updates the saved food for next time. Meals already in your diary keep the nutrition they were logged with.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Food name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Serving size</span>
            <input
              value={servingLabel}
              placeholder="1 scoop, 100 g, 1 serving"
              onChange={(event) => setServingLabel(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Default quantity</span>
            <input
              inputMode="decimal"
              value={defaultPortions}
              onChange={(event) => setDefaultPortions(event.target.value)}
              className={fieldClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Calories (kcal)", calories, setCalories],
                ["Protein (g)", proteinG, setProteinG],
                ["Carbohydrates (g)", carbsG, setCarbsG],
                ["Fat (g)", fatG, setFatG],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">{label}</span>
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => setter(event.target.value)}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
          <p className="text-[12px] leading-5 text-muted">
            Nutrition is for the quantity above.
          </p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-[13px] leading-6 text-muted">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              void save();
            }}
            className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex h-11 items-center rounded-xl border border-border px-5 text-sm text-foreground disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
