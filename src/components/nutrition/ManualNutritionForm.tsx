"use client";

import { useState } from "react";
import {
  labelForMealType,
  mealTypeOptions,
  nutritionStatusOptions,
  type MealTypeId,
  type NutritionEntryStatus,
  type NutritionEstimate,
} from "@/lib/nutrition";
import { validateNutritionMacros } from "@/lib/nutrition-sanity";

export type ManualNutritionValues = {
  description: string;
  mealType: MealTypeId | null;
  status: NutritionEntryStatus;
  estimate: NutritionEstimate;
  saveForReuse: boolean;
};

type ManualNutritionFormProps = {
  initialMealType?: MealTypeId | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (values: ManualNutritionValues) => void;
};

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function ManualNutritionForm({
  initialMealType = null,
  saving,
  error,
  onCancel,
  onSave,
}: ManualNutritionFormProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [mealType, setMealType] = useState<MealTypeId | null>(initialMealType);
  const [status, setStatus] = useState<NutritionEntryStatus>("eaten");
  const [saveForReuse, setSaveForReuse] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setLocalError("Add a food name.");
      return;
    }

    const cal = parseOptionalNumber(calories);
    const proteinG = parseOptionalNumber(protein);
    const carbsG = parseOptionalNumber(carbs);
    const fatG = parseOptionalNumber(fat);

    if (cal == null && proteinG == null && carbsG == null && fatG == null) {
      setLocalError("Enter calories or at least one macro.");
      return;
    }

    const macros = {
      calories: cal ?? 0,
      proteinG: proteinG ?? 0,
      carbsG: carbsG ?? 0,
      fatG: fatG ?? 0,
    };

    const sanity = validateNutritionMacros(macros, { allowPartial: true });
    if (!sanity.ok) {
      setLocalError(sanity.issues[0]?.message ?? "Those values look invalid.");
      return;
    }

    const quantityLabel = quantity.trim();
    const description = quantityLabel
      ? `${trimmedName} (${quantityLabel})`
      : trimmedName;

    setLocalError(null);
    onSave({
      description,
      mealType,
      status,
      saveForReuse,
      estimate: {
        calories: Math.round(macros.calories),
        proteinG: Math.round(macros.proteinG),
        carbsG: Math.round(macros.carbsG),
        fatG: Math.round(macros.fatG),
        confidence: "high",
        source: "user",
        displayName: trimmedName,
        searchAliases: [],
        items: [],
      },
    });
  }

  const inputClass =
    "h-11 w-full rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20";

  return (
    <section className="rounded-[1.75rem] border border-border/80 bg-surface/35 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Manual entry
          </p>
          <h2 className="mt-2 font-serif text-[1.45rem] tracking-tight">
            Enter nutrition
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Leave unknown macros blank — we won’t invent zeros as verified.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">Food name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Waitrose berry granola"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">
            Quantity / serving (optional)
          </span>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="e.g. 40g or 1 bowl"
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Calories</span>
            <input
              inputMode="decimal"
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
              placeholder="kcal"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Protein (g)</span>
            <input
              inputMode="decimal"
              value={protein}
              onChange={(event) => setProtein(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Carbs (g)</span>
            <input
              inputMode="decimal"
              value={carbs}
              onChange={(event) => setCarbs(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Fat (g)</span>
            <input
              inputMode="decimal"
              value={fat}
              onChange={(event) => setFat(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[12px] text-muted">Meal</legend>
          <div className="flex flex-wrap gap-2">
            {mealTypeOptions
              .filter((option) => option.id !== "skip")
              .map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMealType(option.id as MealTypeId)}
                  className={`rounded-full border px-3 py-2 text-[13px] ${
                    mealType === option.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
          </div>
          <p className="text-[12px] text-muted">
            Selected: {labelForMealType(mealType)}
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[12px] text-muted">Status</legend>
          <div className="flex flex-wrap gap-2">
            {nutritionStatusOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatus(option.id)}
                className={`rounded-full border px-3 py-2 text-[13px] ${
                  status === option.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            checked={saveForReuse}
            onChange={(event) => setSaveForReuse(event.target.checked)}
            className="h-4 w-4"
          />
          Save in my foods for next time
        </label>
      </div>

      {localError || error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {localError ?? error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={handleSubmit}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save food"}
      </button>
    </section>
  );
}
