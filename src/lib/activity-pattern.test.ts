import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dailyCycleCommuteKcal,
  describeActivityAssumptions,
} from "@/lib/activity-pattern";
import { calculateNutritionTargets } from "@/lib/nutrition-targets";

describe("activity pattern and commute calories", () => {
  it("averages twice-weekly commuting instead of treating it as daily", () => {
    const twiceWeekly = dailyCycleCommuteKcal({
      daysPerWeek: 2,
      minutesPerRide: 20,
    });
    const daily = dailyCycleCommuteKcal({
      daysPerWeek: 7,
      minutesPerRide: 20,
    });
    assert.equal(twiceWeekly, 40);
    assert.equal(daily, 140);
    assert.ok(twiceWeekly < daily);
  });

  it("does not invent commute calories when days are zero", () => {
    assert.equal(
      dailyCycleCommuteKcal({ daysPerWeek: 0, minutesPerRide: 30 }),
      0,
    );
  });

  it("raises automatic calorie targets when commute days are recorded", () => {
    const base = {
      age: 35,
      sex: "male",
      height_cm: 180,
      weight_kg: 80,
      primary_goal: "lean",
      activity_level: "light",
    };
    const without = calculateNutritionTargets(base);
    const withCommute = calculateNutritionTargets({
      ...base,
      cycle_commute_days_per_week: 2,
      cycle_commute_minutes: 25,
    });
    assert.equal(without.status, "ok");
    assert.equal(withCommute.status, "ok");
    if (without.status === "ok" && withCommute.status === "ok") {
      assert.ok(
        withCommute.targets.dailyCalories >= without.targets.dailyCalories,
      );
      assert.ok(
        withCommute.targets.tdee > without.targets.tdee,
      );
    }
  });

  it("explains twice-weekly cycling in plain language", () => {
    const lines = describeActivityAssumptions({
      activityLevel: "light",
      cycleCommuteDaysPerWeek: 2,
      cycleCommuteMinutes: 20,
    });
    assert.ok(lines.some((line) => /2 days\/week/i.test(line)));
    assert.ok(lines.some((line) => /not counted as every day/i.test(line)));
  });
});
