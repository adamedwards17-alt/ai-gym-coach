import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMorningRecap } from "@/lib/morning-recap";
import type { NutritionDaySummary } from "@/lib/nutrition";
import type { TrainingSessionRecord } from "@/lib/training";
import type { TodayPlanWorkout } from "@/lib/today-coaching-summary";

function emptyNutrition(
  overrides: Partial<NutritionDaySummary> = {},
): NutritionDaySummary {
  return {
    localDate: "2026-10-12",
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
    consumed: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    remaining: { calories: 2200, proteinG: 160, carbsG: 220, fatG: 70 },
    eatenEntries: [],
    plannedEntries: [],
    ...overrides,
  };
}

describe("buildMorningRecap", () => {
  const today = "2026-10-13";
  const yesterday = "2026-10-12";

  it("flags an empty diary without inventing meals", () => {
    const recap = buildMorningRecap({
      todayDate: today,
      yesterdayDate: yesterday,
      yesterdayNutrition: emptyNutrition(),
      yesterdaySessions: [],
      yesterdayPlanEntries: [],
      todayPlanEntries: [],
    });

    assert.equal(recap.diaryLooksIncomplete, true);
    assert.ok(
      recap.observations.some((item) => /food diary looks empty/i.test(item.text)),
    );
    assert.ok(
      recap.actions.some((action) => action.href.includes(`date=${yesterday}`)),
    );
  });

  it("does not congratulate calorie targets when diary is empty", () => {
    const recap = buildMorningRecap({
      todayDate: today,
      yesterdayDate: yesterday,
      yesterdayNutrition: emptyNutrition({
        consumed: { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      }),
      yesterdaySessions: [],
      yesterdayPlanEntries: [],
      todayPlanEntries: [
        {
          id: "p1",
          title: "Upper body",
          training_type: "strength",
          status: "planned",
          planned_duration_minutes: 45,
        },
      ],
    });

    assert.ok(!recap.observations.some((item) => /close to your calorie/i.test(item.text)));
    assert.match(recap.todayPlanLine, /Upper body/);
  });

  it("reports close calories only from recorded eaten entries", () => {
    const recap = buildMorningRecap({
      todayDate: today,
      yesterdayDate: yesterday,
      yesterdayNutrition: emptyNutrition({
        consumed: { calories: 2100, proteinG: 150, carbsG: 200, fatG: 65 },
        eatenEntries: [
          {
            id: "e1",
            logged_date: yesterday,
            meal_type: "lunch",
            description: "Chicken bowl",
            display_name: "Chicken bowl",
            search_aliases: [],
            barcode: null,
            brand: null,
            status: "eaten",
            calories_estimated: 2100,
            protein_g_estimated: 150,
            carbs_g_estimated: 200,
            fat_g_estimated: 65,
            estimation_confidence: "medium",
            estimation_source: "user",
            meal_id: null,
            portions: 1,
            created_at: "2026-10-12T12:00:00.000Z",
          },
        ],
      }),
      yesterdaySessions: [],
      yesterdayPlanEntries: [],
      todayPlanEntries: [],
    });

    assert.equal(recap.diaryLooksIncomplete, false);
    assert.ok(
      recap.observations.some((item) => /close to your calorie target/i.test(item.text)),
    );
  });

  it("acknowledges a completed planned workout", () => {
    const sessions: TrainingSessionRecord[] = [
      {
        id: "s1",
        session_date: yesterday,
        training_type: "strength",
        title: "Legs",
        duration_minutes: 50,
        notes: null,
        intensity: null,
        calories_burned: null,
        strength_details: null,
        created_at: "2026-10-12T18:00:00.000Z",
      },
    ];
    const plan: TodayPlanWorkout[] = [
      {
        id: "p1",
        title: "Legs",
        training_type: "strength",
        status: "completed",
        planned_duration_minutes: 50,
      },
    ];

    const recap = buildMorningRecap({
      todayDate: today,
      yesterdayDate: yesterday,
      yesterdayNutrition: emptyNutrition({
        consumed: { calories: 1800, proteinG: 120, carbsG: 180, fatG: 55 },
        eatenEntries: [
          {
            id: "e1",
            logged_date: yesterday,
            meal_type: "dinner",
            description: "Salmon",
            display_name: "Salmon",
            search_aliases: [],
            barcode: null,
            brand: null,
            status: "eaten",
            calories_estimated: 1800,
            protein_g_estimated: 120,
            carbs_g_estimated: 180,
            fat_g_estimated: 55,
            estimation_confidence: "medium",
            estimation_source: "user",
            meal_id: null,
            portions: 1,
            created_at: "2026-10-12T20:00:00.000Z",
          },
        ],
      }),
      yesterdaySessions: sessions,
      yesterdayPlanEntries: plan,
      todayPlanEntries: [],
    });

    assert.ok(
      recap.observations.some((item) => /logged training|completed your planned/i.test(item.text)),
    );
  });
});
