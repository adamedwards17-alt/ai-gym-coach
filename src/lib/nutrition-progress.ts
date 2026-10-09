/**
 * Presentation helpers for nutrition progress bars.
 * Consumed totals come from summariseNutritionDay — never recalculate here.
 */

import type { NutritionDaySummary } from "@/lib/nutrition";

export type ProgressTone = "normal" | "over" | "behind";

export type MacroProgress = {
  id: "calories" | "protein" | "carbs" | "fat";
  label: string;
  consumed: number;
  target: number;
  remaining: number;
  unit: string;
  /** 0–100+ fill percentage (may exceed 100 when over). */
  fillPercent: number;
  tone: ProgressTone;
  /** Accessible / visible status text (not colour alone). */
  statusLabel: string | null;
};

function fillPercent(consumed: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return Math.round((consumed / target) * 100);
}

/**
 * Protein pace: only warn later in the day when intake lags a fair waking-day curve.
 * Waking window defaults to 06:00–22:00 local.
 */
export function proteinPaceBehind(input: {
  now: Date;
  consumedProteinG: number;
  targetProteinG: number;
}): boolean {
  const { now, consumedProteinG, targetProteinG } = input;
  if (targetProteinG <= 0) {
    return false;
  }

  const hour = now.getHours() + now.getMinutes() / 60;
  const wake = 6;
  const sleep = 22;
  if (hour < 11) {
    // Morning: never flag protein as behind.
    return false;
  }
  if (hour < 14) {
    return false;
  }

  const elapsed = Math.min(Math.max(hour - wake, 0), sleep - wake);
  const dayLength = sleep - wake;
  const expected = targetProteinG * (elapsed / dayLength);
  // Materially behind: under 70% of expected pace, and at least 25g short of expected.
  return (
    consumedProteinG < expected * 0.7 && expected - consumedProteinG >= 25
  );
}

export function buildMacroProgress(input: {
  summary: NutritionDaySummary;
  now?: Date;
}): MacroProgress[] | null {
  const { summary } = input;
  const now = input.now ?? new Date();

  if (summary.targetsStatus !== "ok" || !summary.targets) {
    return null;
  }

  const { targets, consumed, remaining } = summary;

  const caloriesFill = fillPercent(consumed.calories, targets.daily_calories);
  const proteinFill = fillPercent(consumed.proteinG, targets.protein_g);
  const carbsFill = fillPercent(consumed.carbsG, targets.carbs_g);
  const fatFill = fillPercent(consumed.fatG, targets.fat_g);

  const proteinBehind = proteinPaceBehind({
    now,
    consumedProteinG: consumed.proteinG,
    targetProteinG: targets.protein_g,
  });

  return [
    {
      id: "calories",
      label: "Calories",
      consumed: consumed.calories,
      target: targets.daily_calories,
      remaining: remaining.calories,
      unit: "kcal",
      fillPercent: caloriesFill,
      tone: remaining.calories < 0 ? "over" : "normal",
      statusLabel:
        remaining.calories < 0
          ? `${Math.abs(remaining.calories).toLocaleString()} kcal over`
          : `${remaining.calories.toLocaleString()} kcal remaining`,
    },
    {
      id: "protein",
      label: "Protein",
      consumed: consumed.proteinG,
      target: targets.protein_g,
      remaining: remaining.proteinG,
      unit: "g",
      fillPercent: proteinFill,
      tone:
        remaining.proteinG < 0 ? "over" : proteinBehind ? "behind" : "normal",
      statusLabel:
        remaining.proteinG < 0
          ? `${Math.abs(remaining.proteinG)}g over`
          : proteinBehind
            ? "Behind pace for this time of day"
            : null,
    },
    {
      id: "carbs",
      label: "Carbs",
      consumed: consumed.carbsG,
      target: targets.carbs_g,
      remaining: remaining.carbsG,
      unit: "g",
      fillPercent: carbsFill,
      tone: remaining.carbsG < 0 ? "over" : "normal",
      statusLabel:
        remaining.carbsG < 0 ? `${Math.abs(remaining.carbsG)}g over` : null,
    },
    {
      id: "fat",
      label: "Fat",
      consumed: consumed.fatG,
      target: targets.fat_g,
      remaining: remaining.fatG,
      unit: "g",
      fillPercent: fatFill,
      tone: remaining.fatG < 0 ? "over" : "normal",
      statusLabel:
        remaining.fatG < 0 ? `${Math.abs(remaining.fatG)}g over` : null,
    },
  ];
}
