import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  foodIdentitiesMatch,
  looksAlreadyPortioned,
  normalizeFoodIdentity,
  parseGramsFromText,
  rewriteDescriptionForQuantity,
  scaleMacrosByFactor,
  scaleMacrosByGrams,
} from "@/lib/nutrition-quantity";
import {
  confidenceAfterSanity,
  impliedCaloriesFromMacros,
  validateNutritionMacros,
} from "@/lib/nutrition-sanity";
import { resolveReuseFromRecentFoods } from "@/lib/nutrition-reuse";
import type { NutritionEntryRecord } from "@/lib/nutrition";

describe("quantity parsing and scaling", () => {
  it("parses grams from descriptions", () => {
    assert.equal(parseGramsFromText("40g Waitrose berry granola"), 40);
    assert.equal(parseGramsFromText("Waitrose granola 80 g"), 80);
    assert.equal(parseGramsFromText("two bowls of granola"), null);
  });

  it("scales 40g → 80g of the same saved food exactly once", () => {
    const base = { calories: 180, proteinG: 4, carbsG: 28, fatG: 5 };
    const scaled = scaleMacrosByGrams(base, 40, 80);
    assert.deepEqual(scaled, {
      calories: 360,
      proteinG: 8,
      carbsG: 56,
      fatG: 10,
    });
    // Applying the factor twice would be wrong — single scale only.
    const double = scaleMacrosByFactor(scaled!, 2);
    assert.equal(double.calories, 720);
    assert.notEqual(double.calories, 360);
  });

  it("detects duplicated quantity scaling risk when description is already portioned", () => {
    assert.equal(looksAlreadyPortioned("80g Waitrose berry granola"), true);
    assert.equal(looksAlreadyPortioned("granola (2 servings)"), true);
    assert.equal(looksAlreadyPortioned("Waitrose berry granola"), false);
  });

  it("matches food identity ignoring quantity wording", () => {
    assert.equal(
      foodIdentitiesMatch(
        "80g Waitrose berry granola",
        "40g Waitrose berry granola",
      ),
      true,
    );
    assert.equal(
      normalizeFoodIdentity("40g Waitrose berry granola"),
      "waitrose berry granola",
    );
  });

  it("rewrites description grams when quantity changes", () => {
    assert.equal(
      rewriteDescriptionForQuantity("40g Waitrose berry granola", {
        fromGrams: 40,
        toGrams: 80,
      }),
      "80g Waitrose berry granola",
    );
  });
});

describe("nutrition sanity checks", () => {
  it("flags implausible calorie-to-macro relationships", () => {
    const result = validateNutritionMacros({
      calories: 1200,
      proteinG: 4,
      carbsG: 28,
      fatG: 5,
    });
    assert.equal(result.ok, true);
    assert.equal(result.needsReview, true);
    assert.ok(result.issues.some((i) => i.code === "energy_mismatch"));
  });

  it("rejects impossible energy density for a stated mass", () => {
    // >1000 kcal for 80g granola ≈ 12.5+ kcal/g — reject.
    const result = validateNutritionMacros(
      { calories: 1050, proteinG: 20, carbsG: 120, fatG: 40 },
      { quantityGrams: 80 },
    );
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => i.code === "density_high"));
    assert.equal(confidenceAfterSanity("high", result), "low");
  });

  it("accepts a plausible 80g granola estimate", () => {
    const result = validateNutritionMacros(
      { calories: 360, proteinG: 8, carbsG: 56, fatG: 10 },
      { quantityGrams: 80 },
    );
    assert.equal(result.ok, true);
    assert.equal(result.needsReview, false);
    const implied = impliedCaloriesFromMacros({
      proteinG: 8,
      carbsG: 56,
      fatG: 10,
    });
    assert.ok(Math.abs(implied - 360) < 40);
  });

  it("rejects negative and extreme technical values", () => {
    assert.equal(
      validateNutritionMacros({
        calories: -10,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      }).ok,
      false,
    );
    assert.equal(
      validateNutritionMacros({
        calories: 9000,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      }).ok,
      false,
    );
  });
});

describe("reuse saved food without AI", () => {
  const saved40g: NutritionEntryRecord = {
    id: "e1",
    logged_date: "2026-10-12",
    meal_type: "breakfast",
    description: "40g Waitrose berry granola",
    display_name: "Waitrose berry granola",
    search_aliases: ["granola", "waitrose"],
    barcode: null,
    brand: "Waitrose",
    status: "eaten",
    calories_estimated: 180,
    protein_g_estimated: 4,
    carbs_g_estimated: 28,
    fat_g_estimated: 5,
    estimation_confidence: "high",
    estimation_source: "user",
    created_at: "2026-10-12T08:00:00.000Z",
  };

  it("scales a saved 40g food to 80g without calling AI", () => {
    const resolved = resolveReuseFromRecentFoods({
      description: "80g Waitrose berry granola",
      recent: [saved40g],
    });
    assert.ok(resolved);
    assert.equal(resolved!.method, "grams");
    assert.equal(resolved!.estimate.calories, 360);
    assert.equal(resolved!.estimate.proteinG, 8);
    assert.equal(resolved!.fromGrams, 40);
    assert.equal(resolved!.toGrams, 80);
    assert.match(resolved!.description, /80\s*g/i);
  });

  it("reuses exact saved nutrition when quantity matches", () => {
    const resolved = resolveReuseFromRecentFoods({
      description: "40g Waitrose berry granola",
      recent: [saved40g],
    });
    assert.ok(resolved);
    assert.equal(resolved!.estimate.calories, 180);
    assert.equal(resolved!.factor, 1);
  });

  it("returns null when no reliable saved food matches", () => {
    const resolved = resolveReuseFromRecentFoods({
      description: "mystery street food bowl",
      recent: [saved40g],
    });
    assert.equal(resolved, null);
  });
});
