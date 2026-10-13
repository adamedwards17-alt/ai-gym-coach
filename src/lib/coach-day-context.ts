/**
 * Date-scoped Coach context helpers.
 * Prevents recent-food / multi-day dumps from being treated as a specific day's log.
 */

import { shiftCoachDate } from "@/lib/coach";
import { summariseNutritionDay } from "@/lib/nutrition-day";
import type {
  NutritionDaySummary,
  NutritionEntryRecord,
  NutritionTargetRecord,
} from "@/lib/nutrition";
import type { CoachNutritionDayContext } from "@/lib/ai/types";

export function resolveRelativeCoachDate(
  localDate: string,
  relative: "today" | "yesterday",
): string {
  if (relative === "yesterday") {
    return shiftCoachDate(localDate, -1);
  }
  return localDate;
}

/** Entries whose logged_date exactly matches the requested day. */
export function nutritionEntriesForDate(
  entries: NutritionEntryRecord[],
  date: string,
): NutritionEntryRecord[] {
  return entries.filter((entry) => entry.logged_date === date);
}

export function buildNutritionDayContextForDate(input: {
  date: string;
  entries: NutritionEntryRecord[];
  targets: NutritionTargetRecord | null;
  targetsStatus: NutritionDaySummary["targetsStatus"];
  targetsMessage: string | null;
}): CoachNutritionDayContext {
  const dayEntries = nutritionEntriesForDate(input.entries, input.date);
  const summary = summariseNutritionDay({
    localDate: input.date,
    targets: input.targets,
    targetsStatus: input.targetsStatus,
    targetsMessage: input.targetsMessage,
    entries: dayEntries,
  });

  return {
    targets: summary.targets
      ? {
          calories: summary.targets.daily_calories,
          proteinG: summary.targets.protein_g,
          carbsG: summary.targets.carbs_g,
          fatG: summary.targets.fat_g,
          isManual: summary.targets.is_manual === true,
        }
      : null,
    targetsNote: summary.targetsMessage,
    consumed: { ...summary.consumed },
    remaining: { ...summary.remaining },
    eaten: summary.eatenEntries.map((entry) => ({
      date: entry.logged_date,
      mealType: entry.meal_type,
      description: entry.description,
      status: entry.status,
      caloriesEstimated: entry.calories_estimated,
      proteinGEstimated: entry.protein_g_estimated,
      carbsGEstimated: entry.carbs_g_estimated,
      fatGEstimated: entry.fat_g_estimated,
      estimationConfidence: entry.estimation_confidence,
    })),
    planned: summary.plannedEntries.map((entry) => ({
      date: entry.logged_date,
      mealType: entry.meal_type,
      description: entry.description,
      status: entry.status,
      caloriesEstimated: entry.calories_estimated,
      proteinGEstimated: entry.protein_g_estimated,
      carbsGEstimated: entry.carbs_g_estimated,
      fatGEstimated: entry.fat_g_estimated,
      estimationConfidence: entry.estimation_confidence,
    })),
  };
}

/**
 * Pure isolation check used by regression tests: foods from other dates must
 * not appear in a day review list.
 */
export function dayReviewFoodDescriptions(
  entries: NutritionEntryRecord[],
  reviewDate: string,
): string[] {
  return nutritionEntriesForDate(entries, reviewDate)
    .filter((entry) => entry.status === "eaten")
    .map((entry) => entry.description);
}
