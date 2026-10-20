"use client";

import { useMemo, useState } from "react";
import {
  descriptionFromMealDraft,
  emptyIngredient,
  formatIngredientQuantity,
  mealDraftTotals,
  scaleIngredientsForPortions,
  updateIngredientDisplayNutrition,
  updateIngredientDisplayQuantity,
  withPortionsEaten,
  type MealDraft,
  type MealQuantityUnit,
} from "@/lib/meal-builder";
import {
  labelForMealType,
  mealTypeOptions,
  nutritionStatusOptions,
  type MealTypeId,
  type NutritionEntryStatus,
} from "@/lib/nutrition";

const PORTION_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3] as const;

export type MealBuilderSaveValues = {
  draft: MealDraft;
  description: string;
  mealType: MealTypeId | null;
  status: NutritionEntryStatus;
  saveDefinition: boolean;
};

type NutritionMealBuilderProps = {
  initialDraft: MealDraft;
  initialMealType?: MealTypeId | null;
  saving: boolean;
  error: string | null;
  notice?: string | null;
  onCancel: () => void;
  onSave: (values: MealBuilderSaveValues) => void;
};

function formatMacro(value: number, kind: "cal" | "g"): string {
  if (kind === "cal") {
    return String(Math.round(value));
  }
  return String(Math.round(value * 10) / 10);
}

export function NutritionMealBuilder({
  initialDraft,
  initialMealType = null,
  saving,
  error,
  notice = null,
  onCancel,
  onSave,
}: NutritionMealBuilderProps) {
  const [draft, setDraft] = useState<MealDraft>(initialDraft);
  const [mealType, setMealType] = useState<MealTypeId | null>(initialMealType);
  const [status, setStatus] = useState<NutritionEntryStatus>("eaten");
  const [saveDefinition, setSaveDefinition] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const scaled = useMemo(
    () => scaleIngredientsForPortions(draft.ingredients, draft.portionsEaten),
    [draft.ingredients, draft.portionsEaten],
  );
  const totals = useMemo(() => mealDraftTotals(draft), [draft]);

  function setTitle(title: string) {
    setDraft((current) => ({ ...current, title }));
  }

  function setPortions(portions: number) {
    setDraft((current) => withPortionsEaten(current, portions));
  }

  function addIngredient() {
    setDraft((current) => ({
      ...current,
      ingredients: [...current.ingredients, emptyIngredient({ name: "" })],
    }));
  }

  function removeIngredient(id: string) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.filter((item) => item.id !== id),
    }));
  }

  function renameIngredient(id: string, name: string) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((item) =>
        item.id === id ? { ...item, name } : item,
      ),
    }));
  }

  const inputClass =
    "h-10 w-full rounded-full border border-border bg-surface px-3 text-[14px] text-foreground outline-none focus:border-primary";

  return (
    <section className="rounded-2xl border border-border/80 bg-surface/35 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Meal
          </p>
          <input
            aria-label="Meal title"
            value={draft.title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-2 w-full border-0 bg-transparent font-serif text-[1.55rem] leading-tight tracking-tight text-foreground outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 pt-1 text-[13px] text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      {notice ? (
        <p className="mt-3 text-[13px] leading-5 text-muted">{notice}</p>
      ) : null}

      <div className="mt-5">
        <p className="text-[12px] text-muted">Portions eaten</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PORTION_PRESETS.map((preset) => {
            const selected = draft.portionsEaten === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => setPortions(preset)}
                className={`min-h-10 min-w-12 rounded-full border px-3 text-[13px] ${
                  selected
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {preset}×
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          One portion is the recipe below. Changing portions scales every
          ingredient for this log only.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          Ingredients
        </p>
        {scaled.map((ingredient) => {
          const expanded = expandedId === ingredient.id;
          const qtyLabel = formatIngredientQuantity(
            ingredient,
            draft.portionsEaten,
          );
          return (
            <div
              key={ingredient.id}
              className="rounded-2xl border border-border/70 bg-background/40 px-3 py-3"
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() =>
                  setExpandedId((current) =>
                    current === ingredient.id ? null : ingredient.id,
                  )
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-foreground">
                    {ingredient.name || "Ingredient"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {qtyLabel}
                    {ingredient.estimated ? " · estimated" : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-[12px] text-muted">
                  <p>{formatMacro(ingredient.displayCalories, "cal")} kcal</p>
                  <p>
                    P{formatMacro(ingredient.displayProteinG, "g")} · C
                    {formatMacro(ingredient.displayCarbsG, "g")} · F
                    {formatMacro(ingredient.displayFatG, "g")}
                  </p>
                </div>
              </button>

              {expanded ? (
                <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-muted">Name</span>
                    <input
                      value={ingredient.name}
                      onChange={(event) =>
                        renameIngredient(ingredient.id, event.target.value)
                      }
                      className={inputClass}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted">Quantity</span>
                      <input
                        inputMode="decimal"
                        value={
                          ingredient.displayQuantityAmount != null
                            ? String(ingredient.displayQuantityAmount)
                            : ""
                        }
                        placeholder={ingredient.quantityLabel ?? "Amount"}
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          const amount =
                            raw === ""
                              ? null
                              : Number(raw.replace(",", "."));
                          setDraft((current) =>
                            updateIngredientDisplayQuantity(
                              current,
                              ingredient.id,
                              amount != null && Number.isFinite(amount)
                                ? amount
                                : null,
                              ingredient.quantityUnit,
                              ingredient.quantityLabel,
                            ),
                          );
                        }}
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted">Unit</span>
                      <select
                        value={ingredient.quantityUnit ?? "other"}
                        onChange={(event) => {
                          const unit = event.target.value as MealQuantityUnit;
                          setDraft((current) =>
                            updateIngredientDisplayQuantity(
                              current,
                              ingredient.id,
                              ingredient.displayQuantityAmount,
                              unit,
                              ingredient.quantityLabel,
                            ),
                          );
                        }}
                        className={inputClass}
                      >
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="count">count</option>
                        <option value="handful">handful</option>
                        <option value="serving">serving</option>
                        <option value="other">other</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ["calories", "Calories", ingredient.displayCalories],
                        ["proteinG", "Protein", ingredient.displayProteinG],
                        ["carbsG", "Carbs", ingredient.displayCarbsG],
                        ["fatG", "Fat", ingredient.displayFatG],
                      ] as const
                    ).map(([key, label, value]) => (
                      <label key={key} className="flex flex-col gap-1">
                        <span className="text-[11px] text-muted">{label}</span>
                        <input
                          inputMode="decimal"
                          value={String(value)}
                          onChange={(event) => {
                            const next = Number(
                              event.target.value.replace(",", "."),
                            );
                            if (!Number.isFinite(next) || next < 0) {
                              return;
                            }
                            setDraft((current) =>
                              updateIngredientDisplayNutrition(
                                current,
                                ingredient.id,
                                {
                                  calories:
                                    key === "calories"
                                      ? next
                                      : ingredient.displayCalories,
                                  proteinG:
                                    key === "proteinG"
                                      ? next
                                      : ingredient.displayProteinG,
                                  carbsG:
                                    key === "carbsG"
                                      ? next
                                      : ingredient.displayCarbsG,
                                  fatG:
                                    key === "fatG"
                                      ? next
                                      : ingredient.displayFatG,
                                },
                              ),
                            );
                          }}
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeIngredient(ingredient.id)}
                    className="self-start text-[12px] text-muted hover:text-foreground"
                  >
                    Remove ingredient
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={addIngredient}
          className="text-[13px] text-foreground/90 underline-offset-2 hover:underline"
        >
          + Add ingredient
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-border/70 bg-background/50 px-4 py-3">
        <p className="text-[12px] text-muted">Meal totals</p>
        <p className="mt-1 text-[15px] text-foreground">
          {formatMacro(totals.calories, "cal")} kcal · P
          {formatMacro(totals.proteinG, "g")} · C
          {formatMacro(totals.carbsG, "g")} · F
          {formatMacro(totals.fatG, "g")}
        </p>
      </div>

      <fieldset className="mt-4">
        <legend className="text-[12px] text-muted">Meal category</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {mealTypeOptions
            .filter((option) => option.id !== "skip")
            .map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMealType(option.id as MealTypeId)}
                className={`rounded-full border px-3 py-2 text-[13px] ${
                  mealType === option.id
                    ? "border-primary bg-primary text-white"
                    : "border-border text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
        </div>
        <p className="mt-1 text-[12px] text-muted">
          {labelForMealType(mealType)}
        </p>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="text-[12px] text-muted">Status</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {nutritionStatusOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStatus(option.id)}
              className={`rounded-full border px-3 py-2 text-[13px] ${
                status === option.id
                  ? "border-primary bg-primary text-white"
                  : "border-border text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 flex items-center gap-2 text-[13px] text-foreground">
        <input
          type="checkbox"
          checked={saveDefinition}
          onChange={(event) => setSaveDefinition(event.target.checked)}
          className="h-4 w-4"
        />
        Save meal definition for reuse (1 portion recipe)
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={saving || !draft.title.trim()}
        className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-white disabled:opacity-60"
        onClick={() =>
          onSave({
            draft,
            description: descriptionFromMealDraft(draft),
            mealType,
            status,
            saveDefinition,
          })
        }
      >
        {saving ? "Saving…" : "Save meal"}
      </button>
    </section>
  );
}
