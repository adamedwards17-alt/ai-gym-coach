/**
 * Structured meal drafts: 1-portion ingredient definitions vs portions eaten.
 * Totals are always derived from ingredients × portions — never dual-written.
 */

import type {
  NutritionEstimationConfidence,
  NutritionEstimationSource,
  NutritionEstimate,
} from "@/lib/nutrition";
import {
  scaleMacrosByFactor,
  type MacroTotals,
} from "@/lib/nutrition-quantity";

export type MealQuantityUnit = "g" | "ml" | "count" | "handful" | "serving" | "other";

export type MealIngredient = {
  id: string;
  name: string;
  /** Amount for ONE portion of the meal definition. */
  quantityAmount: number | null;
  quantityUnit: MealQuantityUnit | null;
  /** Free-text label when amount/unit are approximate (e.g. "1 handful"). */
  quantityLabel: string | null;
  /** Nutrition for ONE portion of this ingredient. */
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  estimated: boolean;
  /** When true, quantity/macro edits should not be overwritten by AI. */
  manualNutrition: boolean;
};

export type MealDraft = {
  title: string;
  ingredients: MealIngredient[];
  /** Portions consumed for this log (definition stays at 1×). */
  portionsEaten: number;
  confidence: NutritionEstimationConfidence;
  source: NutritionEstimationSource;
  searchAliases: string[];
};

export type ScaledIngredient = MealIngredient & {
  /** Display quantity = definition × portionsEaten. */
  displayQuantityAmount: number | null;
  displayCalories: number;
  displayProteinG: number;
  displayCarbsG: number;
  displayFatG: number;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ing-${Math.random().toString(36).slice(2, 10)}`;
}

function roundCal(value: number): number {
  return Math.max(0, Math.round(value));
}

function roundMacro(value: number): number {
  return Math.max(0, Math.round(value * 10) / 10);
}

export function emptyIngredient(partial?: Partial<MealIngredient>): MealIngredient {
  return {
    id: partial?.id ?? newId(),
    name: partial?.name ?? "",
    quantityAmount: partial?.quantityAmount ?? null,
    quantityUnit: partial?.quantityUnit ?? null,
    quantityLabel: partial?.quantityLabel ?? null,
    calories: partial?.calories ?? 0,
    proteinG: partial?.proteinG ?? 0,
    carbsG: partial?.carbsG ?? 0,
    fatG: partial?.fatG ?? 0,
    estimated: partial?.estimated ?? true,
    manualNutrition: partial?.manualNutrition ?? false,
  };
}

export function formatIngredientQuantity(
  ingredient: Pick<
    MealIngredient,
    "quantityAmount" | "quantityUnit" | "quantityLabel"
  >,
  portions = 1,
): string {
  if (ingredient.quantityLabel && ingredient.quantityAmount == null) {
    if (portions === 1) {
      return ingredient.quantityLabel;
    }
    return `${formatPortions(portions)} × ${ingredient.quantityLabel}`;
  }
  if (ingredient.quantityAmount == null) {
    return ingredient.quantityLabel ?? "—";
  }
  const amount = roundMacro(ingredient.quantityAmount * portions);
  const unit = ingredient.quantityUnit ?? "";
  if (unit === "count" || unit === "handful" || unit === "serving") {
    const label =
      unit === "handful"
        ? amount === 1
          ? "handful"
          : "handfuls"
        : unit === "serving"
          ? amount === 1
            ? "serving"
            : "servings"
          : "";
    return label ? `${formatNumber(amount)} ${label}` : formatNumber(amount);
  }
  if (unit === "g" || unit === "ml") {
    return `${formatNumber(amount)}${unit}`;
  }
  if (unit === "other" || !unit) {
    return ingredient.quantityLabel
      ? portions === 1
        ? ingredient.quantityLabel
        : `${formatNumber(amount)} (${ingredient.quantityLabel})`
      : formatNumber(amount);
  }
  return `${formatNumber(amount)} ${unit}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function formatPortions(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function sumIngredientMacros(
  ingredients: Array<Pick<MealIngredient, "calories" | "proteinG" | "carbsG" | "fatG">>,
): MacroTotals {
  return ingredients.reduce<MacroTotals>(
    (acc, item) => ({
      calories: roundCal(acc.calories + item.calories),
      proteinG: roundMacro(acc.proteinG + item.proteinG),
      carbsG: roundMacro(acc.carbsG + item.carbsG),
      fatG: roundMacro(acc.fatG + item.fatG),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** Totals for the logged amount = definition × portionsEaten. */
export function mealDraftTotals(draft: MealDraft): MacroTotals {
  const base = sumIngredientMacros(draft.ingredients);
  return scaleMacrosByFactor(base, draft.portionsEaten);
}

export function scaleIngredientsForPortions(
  ingredients: MealIngredient[],
  portions: number,
): ScaledIngredient[] {
  const factor = Number.isFinite(portions) && portions > 0 ? portions : 1;
  return ingredients.map((ingredient) => {
    const macros = scaleMacrosByFactor(
      {
        calories: ingredient.calories,
        proteinG: ingredient.proteinG,
        carbsG: ingredient.carbsG,
        fatG: ingredient.fatG,
      },
      factor,
    );
    return {
      ...ingredient,
      displayQuantityAmount:
        ingredient.quantityAmount == null
          ? null
          : roundMacro(ingredient.quantityAmount * factor),
      displayCalories: macros.calories,
      displayProteinG: macros.proteinG,
      displayCarbsG: macros.carbsG,
      displayFatG: macros.fatG,
    };
  });
}

/**
 * Change portions eaten. Ingredient definitions stay at 1× so 1→2→1 restores
 * original values without compounding rounding.
 */
export function withPortionsEaten(draft: MealDraft, portions: number): MealDraft {
  const safe =
    Number.isFinite(portions) && portions > 0
      ? Math.min(12, Math.round(portions * 10) / 10)
      : 1;
  return { ...draft, portionsEaten: safe };
}

/** Scale an ingredient's definition quantity + macros by a factor (exact once). */
export function scaleIngredientDefinition(
  ingredient: MealIngredient,
  factor: number,
): MealIngredient {
  const macros = scaleMacrosByFactor(
    {
      calories: ingredient.calories,
      proteinG: ingredient.proteinG,
      carbsG: ingredient.carbsG,
      fatG: ingredient.fatG,
    },
    factor,
  );
  return {
    ...ingredient,
    quantityAmount:
      ingredient.quantityAmount == null
        ? null
        : roundMacro(ingredient.quantityAmount * factor),
    calories: macros.calories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
  };
}

/**
 * Update displayed quantity while portionsEaten is active: write back to the
 * 1-portion definition so totals stay consistent.
 */
export function updateIngredientDisplayQuantity(
  draft: MealDraft,
  ingredientId: string,
  displayAmount: number | null,
  unit: MealQuantityUnit | null,
  label: string | null,
): MealDraft {
  const portions = Math.max(draft.portionsEaten, 0.01);
  return {
    ...draft,
    ingredients: draft.ingredients.map((ingredient) => {
      if (ingredient.id !== ingredientId) {
        return ingredient;
      }
      const prevAmount = ingredient.quantityAmount;
      const nextAmount =
        displayAmount == null ? null : roundMacro(displayAmount / portions);
      let nextMacros = {
        calories: ingredient.calories,
        proteinG: ingredient.proteinG,
        carbsG: ingredient.carbsG,
        fatG: ingredient.fatG,
      };
      // Auto-scale nutrition when quantity changes and macros weren't manually locked
      // in a conflicting way — proportional to quantity change.
      if (
        !ingredient.manualNutrition &&
        prevAmount != null &&
        prevAmount > 0 &&
        nextAmount != null &&
        nextAmount > 0
      ) {
        nextMacros = scaleMacrosByFactor(
          {
            calories: ingredient.calories,
            proteinG: ingredient.proteinG,
            carbsG: ingredient.carbsG,
            fatG: ingredient.fatG,
          },
          nextAmount / prevAmount,
        );
      }
      return {
        ...ingredient,
        quantityAmount: nextAmount,
        quantityUnit: unit ?? ingredient.quantityUnit,
        quantityLabel: label,
        calories: nextMacros.calories,
        proteinG: nextMacros.proteinG,
        carbsG: nextMacros.carbsG,
        fatG: nextMacros.fatG,
      };
    }),
  };
}

export function updateIngredientDisplayNutrition(
  draft: MealDraft,
  ingredientId: string,
  macros: MacroTotals,
): MealDraft {
  const portions = Math.max(draft.portionsEaten, 0.01);
  return {
    ...draft,
    ingredients: draft.ingredients.map((ingredient) => {
      if (ingredient.id !== ingredientId) {
        return ingredient;
      }
      return {
        ...ingredient,
        calories: roundCal(macros.calories / portions),
        proteinG: roundMacro(macros.proteinG / portions),
        carbsG: roundMacro(macros.carbsG / portions),
        fatG: roundMacro(macros.fatG / portions),
        estimated: false,
        manualNutrition: true,
      };
    }),
  };
}

function parseQuantityFromText(text: string): {
  amount: number | null;
  unit: MealQuantityUnit | null;
  label: string | null;
  name: string;
} {
  const trimmed = text.trim();
  const handful = trimmed.match(
    /^(?:a\s+|one\s+|1\s+)?handful\s+of\s+(.+)$/i,
  );
  if (handful) {
    return {
      amount: 1,
      unit: "handful",
      label: "1 handful",
      name: handful[1]!.trim(),
    };
  }
  const grams = trimmed.match(
    /^(\d+(?:[.,]\d+)?)\s*(g|grams?|grammes?)\s+(?:of\s+)?(.+)$/i,
  );
  if (grams) {
    return {
      amount: Number(grams[1]!.replace(",", ".")),
      unit: "g",
      label: null,
      name: grams[3]!.trim(),
    };
  }
  const ml = trimmed.match(
    /^(\d+(?:[.,]\d+)?)\s*(ml|millilitres?|milliliters?)\s+(?:of\s+)?(.+)$/i,
  );
  if (ml) {
    return {
      amount: Number(ml[1]!.replace(",", ".")),
      unit: "ml",
      label: null,
      name: ml[3]!.trim(),
    };
  }
  const trailing = trimmed.match(
    /^(.+?)\s*[,(]?\s*(\d+(?:[.,]\d+)?)\s*(g|ml|grams?|millilitres?)\s*\)?$/i,
  );
  if (trailing) {
    const unitRaw = trailing[3]!.toLowerCase();
    return {
      amount: Number(trailing[2]!.replace(",", ".")),
      unit: unitRaw.startsWith("m") ? "ml" : "g",
      label: null,
      name: trailing[1]!.trim(),
    };
  }
  return {
    amount: null,
    unit: null,
    label: null,
    name: trimmed,
  };
}

function isMealQuantityUnit(value: unknown): value is MealQuantityUnit {
  return (
    value === "g" ||
    value === "ml" ||
    value === "count" ||
    value === "handful" ||
    value === "serving" ||
    value === "other"
  );
}

/**
 * Build a meal draft from an AI (or barcode) nutrition estimate.
 * Ingredient macros are for ONE portion; portionsEaten starts at 1.
 */
export function mealDraftFromEstimate(
  estimate: NutritionEstimate,
  options?: { titleFallback?: string | null },
): MealDraft {
  const items =
    estimate.items.length > 0
      ? estimate.items
      : [
          {
            description:
              estimate.displayName?.trim() ||
              options?.titleFallback?.trim() ||
              "Food",
            calories: estimate.calories,
            proteinG: estimate.proteinG,
            carbsG: estimate.carbsG,
            fatG: estimate.fatG,
            confidence: estimate.confidence,
          },
        ];

  const ingredients: MealIngredient[] = items.map((item) => {
    const record = item as {
      description: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      confidence: NutritionEstimationConfidence;
      quantityAmount?: number | null;
      quantityUnit?: string | null;
      quantityLabel?: string | null;
    };
    const parsed = parseQuantityFromText(record.description);
    const amount =
      typeof record.quantityAmount === "number"
        ? record.quantityAmount
        : parsed.amount;
    const unit = isMealQuantityUnit(record.quantityUnit)
      ? record.quantityUnit
      : parsed.unit;
    const label =
      typeof record.quantityLabel === "string"
        ? record.quantityLabel
        : parsed.label;
    const name = parsed.name || record.description;

    return emptyIngredient({
      name,
      quantityAmount: amount,
      quantityUnit: unit,
      quantityLabel: label,
      calories: roundCal(record.calories),
      proteinG: roundMacro(record.proteinG),
      carbsG: roundMacro(record.carbsG),
      fatG: roundMacro(record.fatG),
      estimated: record.confidence !== "high",
      manualNutrition: false,
    });
  });

  const title =
    estimate.displayName?.trim() ||
    deriveMealTitle(ingredients, options?.titleFallback) ||
    "Meal";

  return {
    title,
    ingredients,
    portionsEaten: 1,
    confidence: estimate.confidence,
    source: estimate.source,
    searchAliases: estimate.searchAliases ?? [],
  };
}

export function deriveMealTitle(
  ingredients: MealIngredient[],
  fallback?: string | null,
): string {
  if (fallback?.trim()) {
    return fallback.trim().slice(0, 60);
  }
  const primary = ingredients[0]?.name?.trim();
  if (primary) {
    return primary.slice(0, 60);
  }
  return "Meal";
}

/** Description stored on the diary entry (snapshot for history). */
export function descriptionFromMealDraft(draft: MealDraft): string {
  const parts = draft.ingredients
    .filter((item) => item.name.trim())
    .map((item) => {
      const qty = formatIngredientQuantity(item, draft.portionsEaten);
      return qty && qty !== "—" ? `${item.name} (${qty})` : item.name;
    });
  if (parts.length === 0) {
    return draft.title;
  }
  const prefix =
    draft.portionsEaten !== 1
      ? `${formatPortions(draft.portionsEaten)} portions: `
      : "";
  return `${prefix}${parts.join(", ")}`;
}

export function estimateFromMealDraft(draft: MealDraft): NutritionEstimate {
  const totals = mealDraftTotals(draft);
  return {
    calories: totals.calories,
    proteinG: Math.round(totals.proteinG),
    carbsG: Math.round(totals.carbsG),
    fatG: Math.round(totals.fatG),
    confidence: draft.confidence,
    source: draft.source === "gemini" ? "user" : draft.source,
    displayName: draft.title,
    searchAliases: draft.searchAliases,
    items: scaleIngredientsForPortions(draft.ingredients, draft.portionsEaten).map(
      (item) => ({
        description: `${item.name}${
          formatIngredientQuantity(item, draft.portionsEaten) !== "—"
            ? ` (${formatIngredientQuantity(item, draft.portionsEaten)})`
            : ""
        }`,
        calories: item.displayCalories,
        proteinG: Math.round(item.displayProteinG),
        carbsG: Math.round(item.displayCarbsG),
        fatG: Math.round(item.displayFatG),
        confidence: item.estimated ? "medium" : "high",
      }),
    ),
  };
}

/** Detect whether an estimate should open the structured meal builder. */
export function shouldOpenMealBuilder(estimate: NutritionEstimate): boolean {
  return estimate.items.length >= 1 || estimate.calories > 0;
}
