import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MealTypeId, NutritionEntryRecord } from "@/lib/nutrition";

/** Mirrors client-side category filtering for recent-food chips. */
function suggestionsForMealCategory(
  entries: NutritionEntryRecord[],
  mealType: MealTypeId | null,
  searchAll: boolean,
): NutritionEntryRecord[] {
  const filtered =
    mealType && !searchAll
      ? entries.filter((entry) => entry.meal_type === mealType)
      : entries;
  const seen = new Set<string>();
  const out: NutritionEntryRecord[] = [];
  for (const entry of filtered) {
    const key = entry.description.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function entry(
  meal_type: MealTypeId,
  description: string,
): NutritionEntryRecord {
  return {
    id: `${meal_type}-${description}`,
    logged_date: "2026-10-12",
    meal_type,
    description,
    display_name: description,
    search_aliases: [],
    barcode: null,
    brand: null,
    status: "eaten",
    calories_estimated: 200,
    protein_g_estimated: 10,
    carbs_g_estimated: 20,
    fat_g_estimated: 5,
    estimation_confidence: "medium",
    estimation_source: "user",
    meal_id: null,
    portions: 1,
    created_at: "2026-10-12T12:00:00.000Z",
  };
}

describe("meal category recent suggestions", () => {
  const entries = [
    entry("breakfast", "Granola"),
    entry("breakfast", "Eggs"),
    entry("lunch", "Chicken salad"),
    entry("dinner", "Cheese test platter"),
    entry("snack", "Protein shake"),
  ];

  it("filters by selected meal category using stored meal_type", () => {
    const breakfast = suggestionsForMealCategory(entries, "breakfast", false);
    assert.deepEqual(
      breakfast.map((item) => item.description).sort(),
      ["Eggs", "Granola"],
    );
    assert.ok(!breakfast.some((item) => /cheese/i.test(item.description)));
  });

  it("returns empty when no foods match the category", () => {
    const drinkOnly = suggestionsForMealCategory(
      [entry("lunch", "Soup")],
      "breakfast",
      false,
    );
    assert.equal(drinkOnly.length, 0);
  });

  it("can search all saved foods when requested", () => {
    const all = suggestionsForMealCategory(entries, "breakfast", true);
    assert.ok(all.some((item) => /cheese/i.test(item.description)));
    assert.equal(all.length, 5);
  });
});
