/**
 * Prefer scaling a saved food over calling AI when the user logs a known item
 * at a different quantity.
 */

import type { NutritionEntryRecord, NutritionEstimate } from "@/lib/nutrition";
import { estimateFromEntry } from "@/lib/nutrition";
import {
  foodIdentitiesMatch,
  parseGramsFromText,
  rewriteDescriptionForQuantity,
  scaleMacrosByFactor,
  scaleMacrosByGrams,
  type MacroTotals,
} from "@/lib/nutrition-quantity";

export type ReuseScaleResult = {
  entry: NutritionEntryRecord;
  estimate: NutritionEstimate;
  description: string;
  /** How the macros were derived. */
  method: "exact" | "grams" | "factor";
  fromGrams: number | null;
  toGrams: number | null;
  factor: number;
};

/**
 * Find the best recent entry for a free-text description and scale its macros
 * when the quantity changed. Returns null when AI (or another source) is needed.
 */
export function resolveReuseFromRecentFoods(input: {
  description: string;
  recent: NutritionEntryRecord[];
}): ReuseScaleResult | null {
  const description = input.description.trim();
  if (!description || input.recent.length === 0) {
    return null;
  }

  const targetGrams = parseGramsFromText(description);
  const candidates = input.recent.filter(
    (entry) =>
      entry.calories_estimated != null &&
      foodIdentitiesMatch(
        description,
        `${entry.display_name ?? ""} ${entry.description}`,
      ),
  );

  if (candidates.length === 0) {
    return null;
  }

  // Prefer entries that already have a gram amount when the user stated grams.
  const ranked = [...candidates].sort((a, b) => {
    const aGrams = parseGramsFromText(a.description);
    const bGrams = parseGramsFromText(b.description);
    if (targetGrams != null) {
      if (aGrams != null && bGrams == null) return -1;
      if (bGrams != null && aGrams == null) return 1;
    }
    // Prefer non-AI sources, then newer.
    const sourceScore = (entry: NutritionEntryRecord) =>
      entry.estimation_source === "open_food_facts"
        ? 0
        : entry.estimation_source === "user"
          ? 1
          : 2;
    return (
      sourceScore(a) - sourceScore(b) ||
      b.created_at.localeCompare(a.created_at)
    );
  });

  const entry = ranked[0];
  const base = estimateFromEntry(entry);
  if (!base) {
    return null;
  }

  const baseMacros: MacroTotals = {
    calories: base.calories,
    proteinG: base.proteinG,
    carbsG: base.carbsG,
    fatG: base.fatG,
  };
  const fromGrams = parseGramsFromText(entry.description);

  if (targetGrams != null && fromGrams != null) {
    const scaled = scaleMacrosByGrams(baseMacros, fromGrams, targetGrams);
    if (!scaled) {
      return null;
    }
    // Same quantity → reuse as-is without inventing a new description rewrite.
    if (Math.abs(targetGrams - fromGrams) < 0.05) {
      return {
        entry,
        estimate: { ...base, ...scaled, source: base.source },
        description: entry.description,
        method: "exact",
        fromGrams,
        toGrams: targetGrams,
        factor: 1,
      };
    }
    return {
      entry,
      estimate: {
        ...base,
        ...scaled,
        source: "user",
        confidence: base.confidence === "low" ? "medium" : base.confidence,
      },
      description: rewriteDescriptionForQuantity(entry.description, {
        fromGrams,
        toGrams: targetGrams,
      }),
      method: "grams",
      fromGrams,
      toGrams: targetGrams,
      factor: targetGrams / fromGrams,
    };
  }

  // User stated grams but the saved row has none — don't pretend we can scale.
  if (targetGrams != null && fromGrams == null) {
    return null;
  }

  // No gram bridge — reuse at 1×; the structured editor can multiply.
  return {
    entry,
    estimate: base,
    description: entry.description,
    method: "exact",
    fromGrams,
    toGrams: targetGrams,
    factor: 1,
  };
}

/** Scale a saved base estimate by a unitless quantity for the structured editor. */
export function scaleSavedEstimate(
  base: NutritionEstimate,
  quantity: number,
): NutritionEstimate {
  const macros = scaleMacrosByFactor(
    {
      calories: base.calories,
      proteinG: base.proteinG,
      carbsG: base.carbsG,
      fatG: base.fatG,
    },
    quantity,
  );
  return {
    ...base,
    ...macros,
    source: quantity === 1 ? base.source : "user",
  };
}
