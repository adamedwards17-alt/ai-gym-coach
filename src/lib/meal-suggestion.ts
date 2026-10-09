/**
 * Time-aware meal category suggestions for nutrition logging.
 * Keep scripts/verify-meal-suggestion.mjs in sync.
 */

import type { MealTypeId } from "@/lib/nutrition";

/** Primary meals the suggester may return (never "other" or "drink"). */
export type SuggestedMealId = "breakfast" | "lunch" | "dinner" | "snack";

/**
 * Configurable local-time windows (minutes since midnight, end exclusive).
 * Breakfast 05:00–10:29 · Lunch 10:30–14:29 · Dinner 17:00–21:29 · else snack.
 */
export const MEAL_TIME_WINDOWS = {
  breakfast: { startMinutes: 5 * 60, endMinutes: 10 * 60 + 30 },
  lunch: { startMinutes: 10 * 60 + 30, endMinutes: 14 * 60 + 30 },
  dinner: { startMinutes: 17 * 60, endMinutes: 21 * 60 + 30 },
} as const;

export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Time-of-day meal before considering what is already logged. */
export function mealFromLocalTime(now: Date): SuggestedMealId {
  const minutes = minutesOfDay(now);
  if (
    minutes >= MEAL_TIME_WINDOWS.breakfast.startMinutes &&
    minutes < MEAL_TIME_WINDOWS.breakfast.endMinutes
  ) {
    return "breakfast";
  }
  if (
    minutes >= MEAL_TIME_WINDOWS.lunch.startMinutes &&
    minutes < MEAL_TIME_WINDOWS.lunch.endMinutes
  ) {
    return "lunch";
  }
  if (
    minutes >= MEAL_TIME_WINDOWS.dinner.startMinutes &&
    minutes < MEAL_TIME_WINDOWS.dinner.endMinutes
  ) {
    return "dinner";
  }
  return "snack";
}

function hasEatenMeal(
  eatenMealTypes: ReadonlyArray<MealTypeId | null | undefined>,
  meal: SuggestedMealId,
): boolean {
  return eatenMealTypes.includes(meal);
}

/**
 * Suggest a meal category for a new food entry.
 *
 * - Prefers the time-of-day window.
 * - If that category already has an eaten entry today, picks the next sensible
 *   unfilled category (usually snack). Never defaults to "other".
 * - Planned entries must not be passed in — only eaten meal types.
 * - Suggestion only; the user may always override.
 */
export function suggestMealType(input: {
  now: Date;
  /** Meal types from eaten entries for the logging date (not planned). */
  eatenMealTypes: ReadonlyArray<MealTypeId | null | undefined>;
}): SuggestedMealId {
  const { now, eatenMealTypes } = input;
  const primary = mealFromLocalTime(now);

  if (!hasEatenMeal(eatenMealTypes, primary)) {
    return primary;
  }

  // Primary slot already used — offer the next sensible category.
  if (primary === "breakfast") {
    if (!hasEatenMeal(eatenMealTypes, "snack")) {
      return "snack";
    }
    if (!hasEatenMeal(eatenMealTypes, "lunch")) {
      return "lunch";
    }
    return "snack";
  }

  if (primary === "lunch") {
    if (!hasEatenMeal(eatenMealTypes, "snack")) {
      return "snack";
    }
    if (!hasEatenMeal(eatenMealTypes, "dinner")) {
      // Late lunch window can tip toward dinner after lunch is full.
      const minutes = minutesOfDay(now);
      if (minutes >= 14 * 60) {
        return "dinner";
      }
    }
    return "snack";
  }

  if (primary === "dinner") {
    return "snack";
  }

  // Already in snack hours with snacks logged — still suggest snack (multi-entry OK).
  return "snack";
}

/** Meal options shown when confirming / editing category (no Skip). */
export const editableMealTypeOptions: { id: MealTypeId; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snack" },
  { id: "drink", label: "Drink" },
  { id: "other", label: "Other" },
];
