import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  descriptionFromMealDraft,
  mealDraftFromEstimate,
  mealDraftTotals,
  scaleIngredientsForPortions,
  updateIngredientDisplayNutrition,
  updateIngredientDisplayQuantity,
  withPortionsEaten,
  type MealDraft,
  type MealIngredient,
} from "@/lib/meal-builder";
import type { NutritionEstimate } from "@/lib/nutrition";

const granolaEstimate: NutritionEstimate = {
  calories: 280,
  proteinG: 7,
  carbsG: 42,
  fatG: 9,
  confidence: "medium",
  source: "gemini",
  displayName: "Waitrose Berry Granola",
  searchAliases: ["granola", "breakfast"],
  items: [
    {
      description: "40g Waitrose Berry Granola",
      calories: 180,
      proteinG: 4,
      carbsG: 28,
      fatG: 5,
      confidence: "high",
    },
    {
      description: "100ml oat milk",
      calories: 45,
      proteinG: 1,
      carbsG: 7,
      fatG: 2,
      confidence: "medium",
    },
    {
      description: "a handful of blueberries",
      calories: 55,
      proteinG: 2,
      carbsG: 7,
      fatG: 2,
      confidence: "low",
    },
  ],
};

function sampleDraft(): MealDraft {
  return mealDraftFromEstimate(granolaEstimate);
}

describe("meal draft from AI estimate", () => {
  it("parses a multi-ingredient description into a structured draft", () => {
    const draft = sampleDraft();
    assert.equal(draft.title, "Waitrose Berry Granola");
    assert.equal(draft.ingredients.length, 3);
    assert.equal(draft.portionsEaten, 1);
    assert.equal(draft.ingredients[0]!.quantityAmount, 40);
    assert.equal(draft.ingredients[0]!.quantityUnit, "g");
    assert.equal(draft.ingredients[1]!.quantityAmount, 100);
    assert.equal(draft.ingredients[1]!.quantityUnit, "ml");
    assert.equal(draft.ingredients[2]!.quantityUnit, "handful");
    assert.equal(mealDraftTotals(draft).calories, 280);
  });

  it("produces an editable draft without requiring chat interaction state", () => {
    const draft = sampleDraft();
    assert.ok(draft.title);
    assert.ok(Array.isArray(draft.ingredients));
    assert.equal(typeof draft.portionsEaten, "number");
  });
});

describe("ingredient quantity and portion scaling", () => {
  it("recalculates totals when an ingredient quantity changes", () => {
    let draft = sampleDraft();
    draft = updateIngredientDisplayQuantity(draft, draft.ingredients[0]!.id, 80, "g", null);
    const granola = draft.ingredients[0]!;
    assert.equal(granola.quantityAmount, 80);
    assert.equal(granola.calories, 360);
    assert.equal(mealDraftTotals(draft).calories, 460);
  });

  it("doubles all ingredient quantities when changing from 1 to 2 portions", () => {
    const draft = withPortionsEaten(sampleDraft(), 2);
    const scaled = scaleIngredientsForPortions(draft.ingredients, draft.portionsEaten);
    assert.equal(scaled[0]!.displayQuantityAmount, 80);
    assert.equal(scaled[1]!.displayQuantityAmount, 200);
    assert.equal(scaled[2]!.displayQuantityAmount, 2);
    assert.equal(mealDraftTotals(draft).calories, 560);
    assert.match(descriptionFromMealDraft(draft), /2 portions/i);
  });

  it("restores original quantities when changing back to one portion", () => {
    const base = sampleDraft();
    const doubled = withPortionsEaten(base, 2);
    const restored = withPortionsEaten(doubled, 1);
    assert.deepEqual(
      restored.ingredients.map((i) => [
        i.quantityAmount,
        i.calories,
        i.proteinG,
        i.carbsG,
        i.fatG,
      ]),
      base.ingredients.map((i) => [
        i.quantityAmount,
        i.calories,
        i.proteinG,
        i.carbsG,
        i.fatG,
      ]),
    );
    assert.equal(mealDraftTotals(restored).calories, mealDraftTotals(base).calories);
  });

  it("avoids double-scaling between definition edits and portions eaten", () => {
    let draft = sampleDraft();
    // Edit display quantity while at 2 portions → writes back to 1-portion def.
    draft = withPortionsEaten(draft, 2);
    draft = updateIngredientDisplayQuantity(
      draft,
      draft.ingredients[0]!.id,
      80,
      "g",
      null,
    );
    // Definition should be 40g @ 180 kcal, display at 2× still 80g / 360.
    assert.equal(draft.ingredients[0]!.quantityAmount, 40);
    assert.equal(draft.ingredients[0]!.calories, 180);
    const scaled = scaleIngredientsForPortions(
      draft.ingredients,
      draft.portionsEaten,
    );
    assert.equal(scaled[0]!.displayQuantityAmount, 80);
    assert.equal(scaled[0]!.displayCalories, 360);
  });

  it("preserves manual ingredient nutrition edits", () => {
    let draft = sampleDraft();
    const id = draft.ingredients[1]!.id;
    draft = updateIngredientDisplayNutrition(draft, id, {
      calories: 60,
      proteinG: 2,
      carbsG: 8,
      fatG: 3,
    });
    assert.equal(draft.ingredients[1]!.manualNutrition, true);
    assert.equal(draft.ingredients[1]!.estimated, false);
    assert.equal(draft.ingredients[1]!.calories, 60);
    // Quantity change must not overwrite locked macros.
    draft = updateIngredientDisplayQuantity(draft, id, 200, "ml", null);
    assert.equal(draft.ingredients[1]!.calories, 60);
    assert.equal(draft.ingredients[1]!.manualNutrition, true);
  });
});

describe("meal definition vs logged portions", () => {
  it("keeps the 1-portion recipe separate from portions eaten on a log", () => {
    const definition = sampleDraft();
    const loggedToday = withPortionsEaten(definition, 2);
    const loggedTomorrow = withPortionsEaten(definition, 1);
    assert.equal(definition.portionsEaten, 1);
    assert.equal(loggedToday.portionsEaten, 2);
    assert.equal(loggedTomorrow.portionsEaten, 1);
    assert.equal(mealDraftTotals(loggedToday).calories, 560);
    assert.equal(mealDraftTotals(loggedTomorrow).calories, 280);
    // Editing tomorrow's portions does not mutate the shared definition ingredients.
    assert.equal(definition.ingredients[0]!.quantityAmount, 40);
  });

  it("does not rewrite historical snapshot text when portions differ by day", () => {
    const recipe = sampleDraft();
    const day1 = descriptionFromMealDraft(withPortionsEaten(recipe, 2));
    const day2 = descriptionFromMealDraft(withPortionsEaten(recipe, 1));
    assert.match(day1, /80\s*g/i);
    assert.match(day2, /40\s*g/i);
    assert.notEqual(day1, day2);
  });

  it("labels uncertain approximate quantities", () => {
    const draft = sampleDraft();
    const berries = draft.ingredients[2]!;
    assert.equal(berries.estimated, true);
    assert.equal(berries.quantityUnit, "handful");
    assert.ok(berries.quantityLabel || berries.quantityAmount === 1);
  });
});

describe("shared editor consistency helpers", () => {
  it("builds the same totals path for new meals and reused definitions", () => {
    const fromAi = sampleDraft();
    const reused: MealDraft = {
      ...fromAi,
      source: "user",
      portionsEaten: 1,
    };
    assert.deepEqual(mealDraftTotals(fromAi), mealDraftTotals(reused));
    const ingredient: MealIngredient = fromAi.ingredients[0]!;
    assert.equal(ingredient.name.toLowerCase().includes("granola"), true);
  });
});
