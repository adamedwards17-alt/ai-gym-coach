import assert from "node:assert/strict";
import test from "node:test";
import { decideCoachingNotification, type CoachingFacts } from "@/lib/coaching-notifications";
import {
  buildEveningPlan,
  eveningCanFinish,
  foodAlreadyLogged,
  isEveningDateAllowed,
  type EveningDay,
} from "@/lib/evening-check-in";
import type { NutritionEntryRecord } from "@/lib/nutrition";

function meal(
  id: string,
  mealType: NutritionEntryRecord["meal_type"],
  name: string,
): NutritionEntryRecord {
  return {
    id,
    logged_date: "2026-01-15",
    meal_type: mealType,
    description: name,
    display_name: name,
    search_aliases: [],
    barcode: null,
    brand: null,
    status: "eaten",
    calories_estimated: 400,
    protein_g_estimated: 30,
    carbs_g_estimated: 40,
    fat_g_estimated: 10,
    estimation_confidence: "high",
    estimation_source: "user",
    meal_id: null,
    portions: 1,
    created_at: "2026-01-15T12:00:00.000Z",
  };
}

function day(overrides: Partial<EveningDay> = {}): EveningDay {
  return {
    meals: [],
    loggedWorkout: null,
    plannedTitle: null,
    morningEnergy: null,
    morningSleep: null,
    ...overrides,
  };
}

function ids(plan: ReturnType<typeof buildEveningPlan>): string[] {
  return plan.steps.map((step) => step.id);
}

test("no workout and no meals asks about training and each meal", () => {
  const plan = buildEveningPlan(day(), null);
  assert.equal(plan.mode, "questions");
  assert.ok(ids(plan).includes("training"));
  assert.ok(ids(plan).includes("breakfast"));
  assert.ok(ids(plan).includes("lunch"));
  assert.ok(ids(plan).includes("dinner"));
  assert.ok(ids(plan).includes("extras"));
  assert.equal(plan.loggedWorkout, null);
});

test("logged workout skips the training question and still asks about a missing lunch", () => {
  const plan = buildEveningPlan(
    day({
      loggedWorkout: { title: "Upper strength", trainingType: "strength", durationMinutes: 48 },
      meals: [meal("b", "breakfast", "Yogurt"), meal("d", "dinner", "Salmon")],
      morningEnergy: 4,
      morningSleep: "good",
    }),
    null,
  );
  assert.equal(ids(plan).includes("training"), false);
  assert.equal(ids(plan).includes("breakfast"), false);
  assert.equal(ids(plan).includes("dinner"), false);
  assert.ok(ids(plan).includes("lunch"));
  assert.equal(plan.loggedWorkout?.title, "Upper strength");
  assert.equal(ids(plan).includes("energy"), false);
  assert.equal(ids(plan).includes("readiness"), false);
});

test("breakfast and lunch logged still asks about dinner and snacks", () => {
  const plan = buildEveningPlan(
    day({
      meals: [meal("b", "breakfast", "Oats"), meal("l", "lunch", "Chicken")],
    }),
    null,
  );
  assert.equal(ids(plan).includes("breakfast"), false);
  assert.equal(ids(plan).includes("lunch"), false);
  assert.ok(ids(plan).includes("dinner"));
  assert.ok(ids(plan).includes("extras"));
});

test("a complete diary and workout leaves recovery questions only", () => {
  const plan = buildEveningPlan(
    day({
      loggedWorkout: { title: "Lower strength", trainingType: "strength", durationMinutes: 50 },
      meals: [
        meal("b", "breakfast", "Oats"),
        meal("l", "lunch", "Chicken"),
        meal("d", "dinner", "Salmon"),
        meal("s", "snack", "Yogurt"),
      ],
      morningEnergy: 4,
      morningSleep: "good",
    }),
    null,
  );
  assert.deepEqual(ids(plan), ["hunger", "soreness"]);
  assert.equal(plan.totals.calories, 1600);
  assert.equal(plan.diary.find((group) => group.id === "snacks")?.items[0]?.serving, "1 serving");
});

test("extra snack can be logged once and then the diary is complete", () => {
  const entries = [meal("b", "breakfast", "Oats"), meal("l", "lunch", "Chicken"), meal("d", "dinner", "Salmon")];
  assert.equal(foodAlreadyLogged(entries, "Protein shake"), false);
  const withSnack = [...entries, meal("s", "snack", "Protein shake")];
  assert.equal(foodAlreadyLogged(withSnack, "Protein shake"), true);
  const plan = buildEveningPlan(
    day({
      loggedWorkout: { title: "Upper strength", trainingType: "strength", durationMinutes: 40 },
      meals: withSnack,
      morningEnergy: 3,
      morningSleep: "okay",
    }),
    { meals: {}, extras: "none" },
  );
  assert.equal(ids(plan).includes("extras"), false);
  assert.equal(ids(plan).includes("dinner"), false);
});

test("forgetting a workout is saved and the training question is not asked again", () => {
  const plan = buildEveningPlan(day(), { meals: {}, training: "forgot" });
  assert.equal(ids(plan).includes("training"), false);
  const open = buildEveningPlan(day(), null);
  assert.equal(open.steps[0]?.kind, "training");
});

test("leaving part way keeps the answers already given", () => {
  const plan = buildEveningPlan(day(), {
    meals: { breakfast: "skipped" },
    training: "rest",
  });
  assert.equal(ids(plan).includes("training"), false);
  assert.equal(ids(plan).includes("breakfast"), false);
  assert.ok(ids(plan).includes("lunch"));
  assert.ok(plan.answered > 0);
  assert.ok(plan.remaining > 0);
});

test("a completed check-in reopens as a review", () => {
  const plan = buildEveningPlan(day({ morningEnergy: 4, morningSleep: "good" }), {
    meals: { breakfast: "skipped", lunch: "skipped", dinner: "skipped" },
    training: "rest",
    extras: "none",
    hunger: "steady",
    soreness: "fine",
    completedAt: "2026-01-15T21:00:00.000Z",
  });
  assert.equal(plan.mode, "review");
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.remaining, 0);
});

test("the check-in date follows the user's timezone", () => {
  const now = new Date("2026-01-16T00:30:00.000Z");
  assert.equal(isEveningDateAllowed("2026-01-15", now, "America/New_York"), true);
  assert.equal(isEveningDateAllowed("2026-01-16", now, "America/New_York"), false);
  assert.equal(isEveningDateAllowed("2026-01-16", now, "Europe/London"), true);
  assert.equal(isEveningDateAllowed("2026-01-14", now, "Europe/London"), false);
});

test("evening notifications open the check-in and other destinations stay put", () => {
  const facts: CoachingFacts = {
    userId: "user-a",
    timeZone: "Europe/London",
    coachingEnabled: true,
    now: new Date("2026-01-15T20:30:00.000Z"),
    checkIns: [
      {
        checkInDate: "2026-01-15",
        createdAt: "2026-01-15T08:00:00.000Z",
        plannedTraining: "rest",
      },
    ],
    meals: [
      {
        loggedDate: "2026-01-15",
        createdAt: "2026-01-15T12:00:00.000Z",
        status: "eaten",
        proteinG: 160,
      },
    ],
    sessions: [],
    planEntries: [],
    proteinTargetG: 150,
    coachMessages: [],
    events: [],
  };
  const evening = decideCoachingNotification(facts);
  assert.equal(evening?.purpose, "evening_wrapup");
  assert.equal(evening?.url, "/today/evening?date=2026-01-15");

  const done = decideCoachingNotification({
    ...facts,
    checkIns: [{ ...facts.checkIns[0], eveningCompleted: true }],
  });
  assert.equal(done, null);

  const workout = decideCoachingNotification({
    ...facts,
    now: new Date("2026-01-15T17:30:00.000Z"),
    planEntries: [{ planDate: "2026-01-15", trainingType: "strength", status: "planned" }],
    checkIns: [
      {
        checkInDate: "2026-01-15",
        createdAt: "2026-01-15T08:00:00.000Z",
        plannedTraining: "strength",
      },
    ],
  });
  assert.equal(workout?.url, "/train");

  const protein = decideCoachingNotification({
    ...facts,
    now: new Date("2026-01-15T16:00:00.000Z"),
    meals: [],
    proteinTargetG: 150,
  });
  assert.equal(protein?.url, "/coach?intent=protein");
  assert.equal(eveningCanFinish(day({ morningEnergy: 4, morningSleep: "good" }), {
    meals: { breakfast: "skipped", lunch: "skipped", dinner: "skipped" },
    training: "rest",
    extras: "none",
    hunger: "low",
    soreness: "fine",
  }), true);
});
