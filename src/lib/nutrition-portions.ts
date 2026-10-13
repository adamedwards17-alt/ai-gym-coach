/**
 * Scale an already-logged entry's nutrition when portions eaten change.
 * Base = current macros / current portions; apply next portions exactly once.
 */

import { scaleMacrosByFactor, type MacroTotals } from "@/lib/nutrition-quantity";

export const PORTION_PRESETS = [0.5, 1, 1.5, 2, 2.5, 3] as const;

export function normalizePortions(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.min(12, Math.round(value * 10) / 10);
}

/**
 * Derive base (1-portion) macros from a logged snapshot, then scale to nextPortions.
 * If macros were manually set as absolute values with portions locked, pass
 * `treatCurrentAsAbsolute: true` after the user edits macros without changing portions.
 */
export function scaleLoggedMacrosForPortions(input: {
  macros: MacroTotals;
  currentPortions: number | null | undefined;
  nextPortions: number;
}): MacroTotals {
  const current = normalizePortions(input.currentPortions);
  const next = normalizePortions(input.nextPortions);
  if (Math.abs(current - next) < 0.001) {
    return {
      calories: Math.round(input.macros.calories),
      proteinG: Math.round(input.macros.proteinG * 10) / 10,
      carbsG: Math.round(input.macros.carbsG * 10) / 10,
      fatG: Math.round(input.macros.fatG * 10) / 10,
    };
  }
  const base = scaleMacrosByFactor(input.macros, 1 / current);
  return scaleMacrosByFactor(base, next);
}
