import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NutritionEntryRecord } from "@/lib/nutrition";
import { summariseNutritionDay } from "@/lib/nutrition-day";
import {
  ADD_NEW_FOOD_LABEL,
  buildNutritionUsuals,
  entriesNotAlreadyLogged,
  entriesToCopy,
  groupNutritionUsuals,
  loggedTodayKeys,
  recentUsualGroups,
  recentUsualsForMeal,
  sumUsualMacros,
  yesterdayLoggedDate,
} from "@/lib/nutrition-usuals";

function entry(
  partial: Partial<NutritionEntryRecord> & Pick<NutritionEntryRecord, "id" | "description" | "logged_date">,
): NutritionEntryRecord {
  return {
    meal_type: "breakfast",
    display_name: partial.description,
    search_aliases: [],
    barcode: null,
    brand: null,
    status: "eaten",
    calories_estimated: 100,
    protein_g_estimated: 10,
    carbs_g_estimated: 12,
    fat_g_estimated: 4,
    estimation_confidence: "high",
    estimation_source: "user",
    meal_id: null,
    portions: 1,
    created_at: `${partial.logged_date}T08:00:00.000Z`,
    ...partial,
  };
}

describe("nutrition usuals", () => {
  it("groups foods by the latest meal category and serving", () => {
    const older = entry({
      id: "old",
      description: "Oats",
      logged_date: "2026-10-18",
      meal_type: "breakfast",
      portions: 1,
      calories_estimated: 200,
      created_at: "2026-10-18T08:00:00.000Z",
    });
    const newer = entry({
      id: "new",
      description: "Oats",
      logged_date: "2026-10-19",
      meal_type: "lunch",
      portions: 1.5,
      calories_estimated: 300,
      protein_g_estimated: 15,
      created_at: "2026-10-19T12:00:00.000Z",
    });
    const usuals = buildNutritionUsuals([older, newer]);
    assert.equal(usuals.length, 1);
    assert.equal(usuals[0]?.mealType, "lunch");
    assert.equal(usuals[0]?.portions, 1.5);
    assert.equal(usuals[0]?.calories, 300);
    assert.equal(older.meal_type, "breakfast");
    assert.equal(groupNutritionUsuals(usuals)[0]?.label, "Lunch");
  });

  it("sums selected macros once each", () => {
    const usuals = buildNutritionUsuals([
      entry({ id: "a", description: "Oats", logged_date: "2026-10-19", calories_estimated: 200, protein_g_estimated: 10 }),
      entry({ id: "b", description: "Yogurt", logged_date: "2026-10-19", calories_estimated: 150, protein_g_estimated: 20, meal_type: "snack" }),
    ]);
    const total = sumUsualMacros(usuals);
    assert.equal(total.calories, 350);
    assert.equal(total.proteinG, 30);
  });

  it("skips foods already on the target day", () => {
    const yesterday = [
      entry({ id: "y1", description: "Oats", logged_date: "2026-10-19" }),
      entry({ id: "y2", description: "Chicken", logged_date: "2026-10-19", meal_type: "dinner" }),
    ];
    const today = [
      entry({ id: "t1", description: "Oats", logged_date: "2026-10-20" }),
    ];
    const copy = entriesNotAlreadyLogged(yesterday, today);
    assert.deepEqual(copy.map((item) => item.id), ["y2"]);
  });

  it("does not copy the same food twice from one selection", () => {
    const incoming = [
      entry({ id: "a", description: "Oats", logged_date: "2026-10-19" }),
      entry({ id: "b", description: "oats", logged_date: "2026-10-18" }),
    ];
    const copy = entriesNotAlreadyLogged(incoming, []);
    assert.equal(copy.length, 1);
  });

  it("uses the calendar day before the diary date", () => {
    assert.equal(yesterdayLoggedDate("2026-03-01"), "2026-02-28");
  });

  it("keeps each meal's own history with the newest log first", () => {
    const entries = [
      entry({
        id: "lunch-old",
        description: "Chicken",
        logged_date: "2026-10-18",
        meal_type: "lunch",
        created_at: "2026-10-18T12:00:00.000Z",
        portions: 1,
      }),
      entry({
        id: "lunch-salad",
        description: "Salad",
        logged_date: "2026-10-19",
        meal_type: "lunch",
        created_at: "2026-10-19T12:30:00.000Z",
      }),
      entry({
        id: "lunch-chicken-again",
        description: "Chicken",
        logged_date: "2026-10-19",
        meal_type: "lunch",
        created_at: "2026-10-19T13:00:00.000Z",
        portions: 2,
        calories_estimated: 500,
      }),
      entry({
        id: "snack-chicken",
        description: "Chicken",
        logged_date: "2026-10-20",
        meal_type: "snack",
        created_at: "2026-10-20T16:00:00.000Z",
        portions: 1,
        calories_estimated: 250,
      }),
    ];

    const lunch = recentUsualsForMeal(entries, "lunch");
    assert.deepEqual(
      lunch.map((item) => item.name),
      ["Chicken", "Salad"],
    );
    assert.equal(lunch[0]?.sourceEntryId, "lunch-chicken-again");
    assert.equal(lunch[0]?.portions, 2);
    assert.equal(lunch.length, 2);

    const snack = recentUsualsForMeal(entries, "snack");
    assert.deepEqual(snack.map((item) => item.sourceEntryId), ["snack-chicken"]);

    const groups = recentUsualGroups(entries);
    assert.deepEqual(
      groups.find((group) => group.mealType === "lunch")?.items.map((item) => item.name),
      ["Chicken", "Salad"],
    );
    assert.equal(groups.find((group) => group.mealType === "breakfast"), undefined);
  });

  it("keeps a food selectable after it was logged today and inserts a new row", () => {
    const existing = entry({
      id: "today-omelette",
      description: "Omelette",
      logged_date: "2026-10-21",
      meal_type: "breakfast",
      calories_estimated: 300,
      protein_g_estimated: 20,
    });
    const source = entry({
      id: "saved-omelette",
      description: "Omelette",
      logged_date: "2026-10-20",
      meal_type: "breakfast",
      calories_estimated: 300,
      protein_g_estimated: 20,
    });
    assert.equal(loggedTodayKeys([existing], "breakfast").has("omelette"), true);
    assert.equal(loggedTodayKeys([existing], "lunch").has("omelette"), false);
    const planned = entry({
      id: "planned",
      description: "Omelette",
      logged_date: "2026-10-21",
      meal_type: "lunch",
      status: "planned",
    });
    assert.equal(loggedTodayKeys([planned], "lunch").size, 0);

    const copy = entriesToCopy([source], [existing], { allowDuplicates: true });
    assert.deepEqual(copy.map((item) => item.id), ["saved-omelette"]);
    assert.equal(existing.id, "today-omelette");
    assert.equal(entriesToCopy([source], [existing]).length, 0);
    assert.equal(ADD_NEW_FOOD_LABEL, "Add a new food or meal");
  });

  it("adds a second serving to the daily total without replacing the first", () => {
    const first = entry({
      id: "first",
      description: "Omelette",
      logged_date: "2026-10-21",
      calories_estimated: 300,
      protein_g_estimated: 20,
      carbs_g_estimated: 2,
      fat_g_estimated: 22,
    });
    const second = entry({
      id: "second",
      description: "Omelette",
      logged_date: "2026-10-21",
      meal_type: "lunch",
      calories_estimated: 300,
      protein_g_estimated: 20,
      carbs_g_estimated: 2,
      fat_g_estimated: 22,
    });
    const summary = summariseNutritionDay({
      localDate: "2026-10-21",
      targets: null,
      targetsStatus: "missing",
      targetsMessage: null,
      entries: [first, second],
    });
    assert.deepEqual(
      summary.eatenEntries.map((item) => item.id),
      ["first", "second"],
    );
    assert.equal(summary.consumed.calories, 600);
    assert.equal(summary.consumed.proteinG, 40);
    assert.equal(summary.consumed.carbsG, 4);
    assert.equal(summary.consumed.fatG, 44);
  });
});
