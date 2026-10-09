/**
 * Hand-off payload when Today habit confirmation opens Nutrition for review.
 * Never auto-saves — Nutrition still requires an explicit Log.
 */

import type { MealTypeId, NutritionEstimate } from "@/lib/nutrition";

export type PendingFoodLog = {
  description: string;
  displayName: string;
  mealType: MealTypeId | null;
  /** Present when macros are known from history. Absent → conversational estimate. */
  estimate: NutritionEstimate | null;
  brand?: string | null;
  barcode?: string | null;
};

const STORAGE_KEY = "aigc:pending-food-log";

export function writePendingFoodLog(payload: PendingFoodLog): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

export function consumePendingFoodLog(): PendingFoodLog | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as PendingFoodLog;
    if (
      typeof parsed?.description !== "string" ||
      !parsed.description.trim()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
