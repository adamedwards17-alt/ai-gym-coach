import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewGoalChange } from "@/lib/goal-change-review";
import { buildGoalChangeCompanions } from "@/lib/ensure-goal-change-companions";

const baseProfile = {
  age: 34,
  sex: "male" as const,
  height_cm: 180,
  weight_kg: 85,
  primary_goal: "muscle",
  activity_level: "light",
  training_frequency: "3-4",
  cycle_commute_days_per_week: null as number | null,
  cycle_commute_minutes: null as number | null,
};

describe("goal change coordinated review", () => {
  it("proposes nutrition when switching to recomp moves calories meaningfully", () => {
    const muscleTargets = {
      dailyCalories: 2900,
      proteinG: 155,
      carbsG: 320,
      fatG: 90,
      isManual: false,
    };
    const review = reviewGoalChange({
      currentGoal: "muscle",
      proposedGoal: "recomp",
      proposedTargetDate: "2025-12-10",
      todayIso: "2025-10-12",
      profile: baseProfile,
      currentTargets: muscleTargets,
      phases: [
        {
          name: "Muscle building",
          kind: "muscle_building",
          status: "active",
          durationWeeks: 8,
        },
      ],
    });
    assert.equal(review.nutrition.action, "propose");
    assert.ok(review.nutrition.proposedTargets);
    assert.ok(
      review.nutrition.proposedTargets!.dailyCalories <
        muscleTargets.dailyCalories,
    );
    assert.match(review.nutrition.reason, /recomp/i);
  });

  it("keeps nutrition when current targets already fit the new goal", () => {
    const recompEstimate = reviewGoalChange({
      currentGoal: "recomp",
      proposedGoal: "recomp",
      proposedTargetDate: "2025-12-10",
      todayIso: "2025-10-12",
      profile: { ...baseProfile, primary_goal: "recomp" },
      currentTargets: null,
      phases: [],
    });
    assert.ok(recompEstimate.nutrition.proposedTargets);
    const targets = recompEstimate.nutrition.proposedTargets!;

    const review = reviewGoalChange({
      currentGoal: "muscle",
      proposedGoal: "recomp",
      proposedTargetDate: "2025-12-10",
      todayIso: "2025-10-12",
      profile: baseProfile,
      currentTargets: {
        dailyCalories: targets.dailyCalories,
        proteinG: targets.proteinG,
        carbsG: targets.carbsG,
        fatG: targets.fatG,
        isManual: false,
      },
      phases: [
        {
          status: "active",
          durationWeeks: 8,
          kind: "other",
          name: "Recomp",
        },
      ],
    });
    assert.equal(review.nutrition.action, "keep");
  });

  it("respects manual targets by proposing without auto-applying", () => {
    const review = reviewGoalChange({
      currentGoal: "muscle",
      proposedGoal: "recomp",
      proposedTargetDate: "2025-12-10",
      todayIso: "2025-10-12",
      profile: baseProfile,
      currentTargets: {
        dailyCalories: 3200,
        proteinG: 140,
        carbsG: 350,
        fatG: 100,
        isManual: true,
      },
      phases: [],
    });
    assert.equal(review.nutrition.action, "propose");
    assert.equal(review.nutrition.currentIsManual, true);
    assert.match(review.nutrition.reason, /manual/i);
  });

  it("flags programme overflow against the deadline", () => {
    const review = reviewGoalChange({
      currentGoal: "muscle",
      proposedGoal: "recomp",
      proposedTargetDate: "2025-12-10",
      todayIso: "2025-10-12",
      profile: baseProfile,
      currentTargets: {
        dailyCalories: 2500,
        proteinG: 170,
        carbsG: 220,
        fatG: 70,
        isManual: false,
      },
      phases: [
        { status: "active", durationWeeks: 6, kind: "muscle_building" },
        { status: "upcoming", durationWeeks: 4, kind: "fat_loss" },
      ],
    });
    assert.equal(review.training.action, "overflow");
  });
});

describe("goal change companions", () => {
  it("attaches a nutrition companion when the coach omitted one", () => {
    const result = buildGoalChangeCompanions({
      currentGoal: "muscle",
      proposedGoalPayload: {
        primaryGoal: "recomp",
        durationWeeks: 8,
      },
      todayIso: "2025-10-12",
      profile: baseProfile,
      currentTargets: {
        dailyCalories: 3000,
        proteinG: 150,
        carbsG: 340,
        fatG: 95,
        isManual: false,
      },
      phases: [{ status: "active", durationWeeks: 8 }],
      nutritionProposalAlreadyPresent: false,
    });
    assert.ok(result.nutritionCompanion);
    assert.equal(result.nutritionCompanion!.payload.setManual, true);
    assert.equal(result.keepNutritionNote, null);
  });

  it("does not duplicate nutrition when the coach already proposed it", () => {
    const result = buildGoalChangeCompanions({
      currentGoal: "muscle",
      proposedGoalPayload: { primaryGoal: "recomp", durationWeeks: 8 },
      todayIso: "2025-10-12",
      profile: baseProfile,
      currentTargets: {
        dailyCalories: 3000,
        proteinG: 150,
        carbsG: 340,
        fatG: 95,
        isManual: false,
      },
      phases: [{ status: "active", durationWeeks: 8 }],
      nutritionProposalAlreadyPresent: true,
    });
    assert.equal(result.nutritionCompanion, null);
  });

  it("notes keep when calories already fit", () => {
    const estimate = buildGoalChangeCompanions({
      currentGoal: "recomp",
      proposedGoalPayload: { primaryGoal: "recomp", durationWeeks: 8 },
      todayIso: "2025-10-12",
      profile: { ...baseProfile, primary_goal: "recomp" },
      currentTargets: null,
      phases: [],
      nutritionProposalAlreadyPresent: false,
    });
    const targets = estimate.review?.nutrition.proposedTargets;
    assert.ok(targets);

    const result = buildGoalChangeCompanions({
      currentGoal: "muscle",
      proposedGoalPayload: { primaryGoal: "recomp", durationWeeks: 8 },
      todayIso: "2025-10-12",
      profile: baseProfile,
      currentTargets: {
        dailyCalories: targets!.dailyCalories,
        proteinG: targets!.proteinG,
        carbsG: targets!.carbsG,
        fatG: targets!.fatG,
        isManual: false,
      },
      phases: [{ status: "active", durationWeeks: 8 }],
      nutritionProposalAlreadyPresent: false,
    });
    assert.equal(result.nutritionCompanion, null);
    assert.ok(result.keepNutritionNote);
  });
});

describe("optional cycling activity", () => {
  it("does not invent commute calories when commute fields are unset", () => {
    const withUnset = reviewGoalChange({
      currentGoal: "recomp",
      proposedGoal: "recomp",
      proposedTargetDate: null,
      todayIso: "2025-10-12",
      profile: {
        ...baseProfile,
        primary_goal: "recomp",
        cycle_commute_days_per_week: null,
        cycle_commute_minutes: null,
      },
      currentTargets: null,
      phases: [],
    });
    const withTwiceWeekly = reviewGoalChange({
      currentGoal: "recomp",
      proposedGoal: "recomp",
      proposedTargetDate: null,
      todayIso: "2025-10-12",
      profile: {
        ...baseProfile,
        primary_goal: "recomp",
        cycle_commute_days_per_week: 2,
        cycle_commute_minutes: 20,
      },
      currentTargets: null,
      phases: [],
    });
    assert.ok(withUnset.nutrition.proposedTargets);
    assert.ok(withTwiceWeekly.nutrition.proposedTargets);
    assert.ok(
      withTwiceWeekly.nutrition.proposedTargets!.tdee >
        withUnset.nutrition.proposedTargets!.tdee,
    );
  });
});
