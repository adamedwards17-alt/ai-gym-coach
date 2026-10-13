/**
 * Plausibility checks for nutrition estimates.
 * Prefer soft flags for review over a single hard calorie ceiling for all foods.
 */

import type { MacroTotals } from "@/lib/nutrition-quantity";

export type NutritionSanityIssue = {
  code:
    | "negative"
    | "technical_limit"
    | "energy_mismatch"
    | "density_high"
    | "density_low"
    | "missing_macros";
  message: string;
  severity: "reject" | "warn";
};

export type NutritionSanityResult = {
  ok: boolean;
  issues: NutritionSanityIssue[];
  /** True when the user should review before treating values as reliable. */
  needsReview: boolean;
};

/** Absolute technical bounds for a single logged item (not a whole day). */
export const TECHNICAL_LIMITS = {
  caloriesMax: 5000,
  macroGMax: 500,
} as const;

/**
 * Atwater factors. Allow slack for fibre, sugar alcohols, rounding and
 * incomplete labels (≈ ±25% or 40 kcal, whichever is larger).
 */
export function impliedCaloriesFromMacros(macros: {
  proteinG: number;
  carbsG: number;
  fatG: number;
}): number {
  return macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9;
}

export function validateNutritionMacros(
  macros: MacroTotals,
  options?: {
    quantityGrams?: number | null;
    /** When true, missing zeros are allowed (manual partial entry). */
    allowPartial?: boolean;
  },
): NutritionSanityResult {
  const issues: NutritionSanityIssue[] = [];
  const { calories, proteinG, carbsG, fatG } = macros;
  const grams = options?.quantityGrams ?? null;

  if (
    calories < 0 ||
    proteinG < 0 ||
    carbsG < 0 ||
    fatG < 0 ||
    !Number.isFinite(calories) ||
    !Number.isFinite(proteinG) ||
    !Number.isFinite(carbsG) ||
    !Number.isFinite(fatG)
  ) {
    issues.push({
      code: "negative",
      message: "Nutrition values can’t be negative.",
      severity: "reject",
    });
    return { ok: false, issues, needsReview: true };
  }

  if (
    calories > TECHNICAL_LIMITS.caloriesMax ||
    proteinG > TECHNICAL_LIMITS.macroGMax ||
    carbsG > TECHNICAL_LIMITS.macroGMax ||
    fatG > TECHNICAL_LIMITS.macroGMax
  ) {
    issues.push({
      code: "technical_limit",
      message: "Those values are outside a sensible range for one food entry.",
      severity: "reject",
    });
  }

  const implied = impliedCaloriesFromMacros({ proteinG, carbsG, fatG });
  if (implied > 0 || calories > 0) {
    const slack = Math.max(40, implied * 0.25, calories * 0.25);
    if (Math.abs(calories - implied) > slack) {
      issues.push({
        code: "energy_mismatch",
        message:
          "Calories don’t line up with the protein, carbs and fat — please review.",
        severity: "warn",
      });
    }
  }

  if (grams != null && grams > 0) {
    const kcalPerG = calories / grams;
    // Pure fat ≈ 9 kcal/g; anything much above that for a whole food is suspicious.
    if (kcalPerG > 12) {
      issues.push({
        code: "density_high",
        message: `About ${Math.round(kcalPerG * 10) / 10} kcal per gram seems too high for ${grams} g — check the quantity or calories.`,
        severity: "reject",
      });
    } else if (kcalPerG > 9.5) {
      issues.push({
        code: "density_high",
        message: `Calories look very high for ${grams} g. Confirm before saving.`,
        severity: "warn",
      });
    } else if (calories > 0 && kcalPerG < 0.15 && grams >= 20) {
      issues.push({
        code: "density_low",
        message: `Calories look very low for ${grams} g. Confirm before saving.`,
        severity: "warn",
      });
    }
  }

  if (
    !options?.allowPartial &&
    calories === 0 &&
    proteinG === 0 &&
    carbsG === 0 &&
    fatG === 0
  ) {
    issues.push({
      code: "missing_macros",
      message: "Add at least calories or a macro before saving.",
      severity: "warn",
    });
  }

  const hasReject = issues.some((issue) => issue.severity === "reject");
  const hasWarn = issues.some((issue) => issue.severity === "warn");

  return {
    ok: !hasReject,
    issues,
    needsReview: hasReject || hasWarn,
  };
}

/** Downgrade confidence when an estimate needs review. */
export function confidenceAfterSanity(
  current: "high" | "medium" | "low",
  sanity: NutritionSanityResult,
): "high" | "medium" | "low" {
  if (!sanity.ok) {
    return "low";
  }
  if (sanity.needsReview) {
    return current === "high" ? "medium" : "low";
  }
  return current;
}
