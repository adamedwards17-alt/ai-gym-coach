"use client";

import { useMemo, useState } from "react";
import { editableMealTypeOptions } from "@/lib/meal-suggestion";
import {
  entryDisplayTitle,
  getLocalLoggedDate,
  isValidLoggedDate,
  labelForMealType,
  type MealTypeId,
  type NutritionEntryRecord,
} from "@/lib/nutrition";
import {
  normalizePortions,
  PORTION_PRESETS,
  scaleLoggedMacrosForPortions,
} from "@/lib/nutrition-portions";

type NutritionEditSheetProps = {
  entry: NutritionEntryRecord;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (values: {
    description: string;
    displayName: string;
    mealType: MealTypeId | null;
    loggedDate: string;
    portions: number;
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
  const initialPortions = normalizePortions(entry.portions);
  const [displayName, setDisplayName] = useState(entryDisplayTitle(entry));
  const [description, setDescription] = useState(entry.description);
  const [mealType, setMealType] = useState<MealTypeId | null>(entry.meal_type);
  const [loggedDate, setLoggedDate] = useState(entry.logged_date);
  const [portions, setPortions] = useState(initialPortions);
  const [basePortions] = useState(initialPortions);
  const [baseMacros] = useState({
    calories: Number(entry.calories_estimated ?? 0),
    proteinG: Number(entry.protein_g_estimated ?? 0),
    carbsG: Number(entry.carbs_g_estimated ?? 0),
    fatG: Number(entry.fat_g_estimated ?? 0),
  });
  const [manualMacros, setManualMacros] = useState(false);
  const [calories, setCalories] = useState(String(Math.round(baseMacros.calories)));
  const [proteinG, setProteinG] = useState(
    String(Math.round(baseMacros.proteinG * 10) / 10),
  );
  const [carbsG, setCarbsG] = useState(
    String(Math.round(baseMacros.carbsG * 10) / 10),
  );
  const [fatG, setFatG] = useState(
    String(Math.round(baseMacros.fatG * 10) / 10),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const scaledPreview = useMemo(
    () =>
      scaleLoggedMacrosForPortions({
        macros: baseMacros,
        currentPortions: basePortions,
        nextPortions: portions,
      }),
    [baseMacros, basePortions, portions],
  );

  function applyPortions(next: number) {
    const safe = normalizePortions(next);
    setPortions(safe);
    if (!manualMacros) {
      const scaled = scaleLoggedMacrosForPortions({
        macros: baseMacros,
        currentPortions: basePortions,
        nextPortions: safe,
      });
      setCalories(String(scaled.calories));
      setProteinG(String(scaled.proteinG));
      setCarbsG(String(scaled.carbsG));
      setFatG(String(scaled.fatG));
    }
  }

  function handleSave() {
    if (!isValidLoggedDate(loggedDate)) {
      setLocalError("Choose a valid date.");
      return;
    }
    const today = getLocalLoggedDate();
    if (loggedDate > today) {
      setLocalError("You can’t log food in the future.");
      return;
    }
    setLocalError(null);
    onSave({
      description,
      displayName,
      mealType,
      loggedDate,
      portions,
      calories: Number(calories),
      proteinG: Number(proteinG),
      carbsG: Number(carbsG),
      fatG: Number(fatG),
    });
  }

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
        className="relative max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-border bg-background p-5 shadow-[0_24px_80px_rgb(0_0_0/0.45)]"
      >
        <p
          id="nutrition-edit-title"
          className="font-serif text-[1.5rem] tracking-tight"
        >
          Edit entry
        </p>
        <p className="mt-1 text-[13px] text-muted">
          Changing portions scales nutrition for this log only — not the saved
          recipe. Saving marks macros as manually confirmed.
        </p>

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Logged date</span>
            <input
              type="date"
              value={loggedDate}
              max={getLocalLoggedDate()}
              onChange={(event) => setLoggedDate(event.target.value)}
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
            />
          </label>

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

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] text-muted">Portions eaten</legend>
            <div className="flex flex-wrap gap-2">
              {PORTION_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => applyPortions(preset)}
                  className={`min-h-10 min-w-12 rounded-full border px-3 text-[13px] ${
                    portions === preset
                      ? "border-white/20 bg-white/10 text-foreground"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {preset}×
                </button>
              ))}
            </div>
            <p className="text-[12px] text-muted">
              Base log was {basePortions}× (
              {Math.round(baseMacros.calories)} kcal). At {portions}× → about{" "}
              {scaledPreview.calories} kcal before manual tweaks.
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] text-muted">Meal category</legend>
            <p className="text-[12px] text-muted">
              Currently {labelForMealType(mealType)}. Tap to move this entry.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {editableMealTypeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMealType(option.id)}
                  className={`rounded-full border px-3 py-2 text-[13px] transition-colors ${
                    mealType === option.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:border-white/20"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

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
                  inputMode="decimal"
                  value={value}
                  onChange={(event) => {
                    setManualMacros(true);
                    setter(event.target.value);
                  }}
                  className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
                />
              </label>
            ))}
          </div>
        </div>

        {localError || error ? (
          <p role="alert" className="mt-3 text-[13px] text-muted">
            {localError ?? error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
            onClick={handleSave}
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
