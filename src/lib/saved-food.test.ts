import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NutritionEntryRecord } from "@/lib/nutrition";
import { summariseNutritionDay } from "@/lib/nutrition-day";
import {
  findSavedFood,
  overlaySavedFoods,
  presentSavedFood,
  savedFoodAliases,
  savedFoodLoggedToday,
  snapshotForNewLog,
  upsertSavedFood,
  validateSavedFood,
  type SavedFoodDefinition,
} from "@/lib/saved-food";

function entry(): NutritionEntryRecord {
  return {
    id: "log-1",
    logged_date: "2026-10-21",
    meal_type: "breakfast",
    description: "Greek yogurt and berries",
    display_name: "Greek yogurt and berries",
    search_aliases: [],
    barcode: null,
    brand: null,
    status: "eaten",
    calories_estimated: 280,
    protein_g_estimated: 24,
    carbs_g_estimated: 28,
    fat_g_estimated: 8,
    estimation_confidence: "high",
    estimation_source: "user",
    meal_id: null,
    portions: 1,
    created_at: "2026-10-21T08:00:00.000Z",
  };
}

function food(): SavedFoodDefinition {
  return {
    id: "meal-1",
    name: "Greek yoghurt and berries",
    aliases: ["Greek yogurt and berries"],
    servingLabel: "150 g",
    defaultPortions: 1,
    caloriesPerPortion: 310,
    proteinGPerPortion: 26,
    carbsGPerPortion: 30,
    fatGPerPortion: 9,
  };
}

describe("saved foods", () => {
  it("rejects a missing name and a negative calorie value", () => {
    const missing = validateSavedFood({
      name: "  ",
      servingLabel: "1 serving",
      defaultPortions: 1,
      calories: 100,
      proteinG: 1,
      carbsG: 1,
      fatG: 1,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.message, "Add a food name.");
    }

    const negative = validateSavedFood({
      name: "Yogurt",
      servingLabel: "150 g",
      defaultPortions: 1,
      calories: -5,
      proteinG: 10,
      carbsG: 8,
      fatG: 2,
    });
    assert.equal(negative.ok, false);
    if (!negative.ok) {
      assert.match(negative.message, /Calories must be zero or more/);
    }
  });

  it("updates the reusable food without rewriting the historical log", () => {
    const historical = entry();
    const shown = presentSavedFood(historical, food());
    assert.equal(historical.calories_estimated, 280);
    assert.equal(historical.display_name, "Greek yogurt and berries");
    assert.equal(shown.display_name, "Greek yoghurt and berries");
    assert.equal(shown.calories_estimated, 310);
    assert.equal(shown.protein_g_estimated, 26);
    assert.equal(shown.meal_id, "meal-1");
    assert.notEqual(shown, historical);

    const summary = summariseNutritionDay({
      localDate: "2026-10-21",
      targets: null,
      targetsStatus: "missing",
      targetsMessage: null,
      entries: [historical],
    });
    assert.equal(summary.consumed.calories, 280);
    assert.equal(summary.eatenEntries[0]?.id, "log-1");
  });

  it("logs the updated values next time and keeps a single saved food", () => {
    const historical = entry();
    const saved = food();
    const snapshot = snapshotForNewLog(historical, [saved]);
    assert.equal(historical.calories_estimated, 280);
    assert.equal(snapshot?.calories, 310);
    assert.equal(snapshot?.displayName, "Greek yoghurt and berries");
    assert.equal(snapshot?.mealId, "meal-1");
    assert.equal(snapshot?.portions, 1);

    const again = upsertSavedFood([saved], {
      ...saved,
      caloriesPerPortion: 320,
      aliases: savedFoodAliases(saved.name, saved.aliases, saved.name),
    });
    assert.equal(again.length, 1);
    assert.equal(again[0]?.caloriesPerPortion, 320);
    assert.equal(
      findSavedFood(again, { name: "Greek yogurt and berries" })?.id,
      "meal-1",
    );
  });

  it("still recognises a renamed food as logged today", () => {
    const today = new Set(["greek yogurt and berries"]);
    assert.equal(
      savedFoodLoggedToday("greek yoghurt and berries", today, [food()]),
      true,
    );
    assert.equal(savedFoodLoggedToday("protein shake", today, [food()]), false);
    const overlaid = overlaySavedFoods([entry()], [food()]);
    assert.equal(overlaid[0]?.calories_estimated, 310);
    assert.equal(entry().calories_estimated, 280);
  });
});
