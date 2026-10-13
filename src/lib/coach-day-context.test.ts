import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNutritionDayContextForDate,
  dayReviewFoodDescriptions,
  nutritionEntriesForDate,
  resolveRelativeCoachDate,
} from "@/lib/coach-day-context";
import type { NutritionEntryRecord } from "@/lib/nutrition";

function entry(
  partial: Partial<NutritionEntryRecord> & {
    logged_date: string;
    description: string;
  },
): NutritionEntryRecord {
  return {
    id: partial.id ?? `id-${partial.description}`,
    logged_date: partial.logged_date,
    meal_type: partial.meal_type ?? "lunch",
    description: partial.description,
    display_name: partial.display_name ?? partial.description,
    search_aliases: [],
    barcode: null,
    brand: null,
    status: partial.status ?? "eaten",
    calories_estimated: partial.calories_estimated ?? 100,
    protein_g_estimated: partial.protein_g_estimated ?? 5,
    carbs_g_estimated: partial.carbs_g_estimated ?? 10,
    fat_g_estimated: partial.fat_g_estimated ?? 4,
    estimation_confidence: "medium",
    estimation_source: "user",
    meal_id: null,
    portions: partial.portions ?? 1,
    created_at: "2026-10-12T12:00:00.000Z",
  };
}

describe("coach day-scoped nutrition context", () => {
  const today = "2026-10-13";
  const yesterday = "2026-10-12";
  const older = "2026-10-09";

  const entries = [
    entry({
      logged_date: older,
      description: "Cheese test platter",
      calories_estimated: 900,
    }),
    entry({
      logged_date: yesterday,
      description: "40g Waitrose berry granola",
      meal_type: "breakfast",
      calories_estimated: 180,
    }),
    entry({
      logged_date: yesterday,
      description: "Chicken salad",
      meal_type: "lunch",
      calories_estimated: 420,
    }),
    entry({
      logged_date: today,
      description: "Protein shake",
      meal_type: "snack",
      calories_estimated: 200,
    }),
  ];

  it("resolves yesterday from the local date", () => {
    assert.equal(resolveRelativeCoachDate(today, "yesterday"), yesterday);
    assert.equal(resolveRelativeCoachDate(today, "today"), today);
  });

  it("isolates yesterday’s foods from older test cheese data", () => {
    const foods = dayReviewFoodDescriptions(entries, yesterday);
    assert.deepEqual(foods.sort(), [
      "40g Waitrose berry granola",
      "Chicken salad",
    ]);
    assert.ok(!foods.some((line) => /cheese/i.test(line)));
    assert.ok(!foods.some((line) => /protein shake/i.test(line)));
  });

  it("builds a yesterday nutrition day that excludes other dates", () => {
    const day = buildNutritionDayContextForDate({
      date: yesterday,
      entries,
      targets: {
        daily_calories: 2200,
        protein_g: 160,
        carbs_g: 220,
        fat_g: 70,
        methodology_version: "v1",
        calculated_at: "2026-10-12T00:00:00.000Z",
        is_manual: false,
      },
      targetsStatus: "ok",
      targetsMessage: null,
    });
    assert.equal(day.consumed.calories, 600);
    assert.equal(day.eaten.length, 2);
    assert.ok(
      day.eaten.every((item) => item.date === yesterday),
    );
    assert.ok(!day.eaten.some((item) => /cheese/i.test(item.description)));
  });

  it("returns an empty review when that date has no entries", () => {
    assert.equal(nutritionEntriesForDate(entries, "2026-10-01").length, 0);
    assert.deepEqual(dayReviewFoodDescriptions(entries, "2026-10-01"), []);
  });
});
