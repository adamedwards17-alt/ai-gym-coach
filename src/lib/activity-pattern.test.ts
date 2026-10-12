import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  commutePatternFromLegacyCycle,
  dailyCommuteEntryKcal,
  dailyCommutePatternKcal,
  dailyCycleCommuteKcal,
  describeActivityAssumptions,
  parseCommutePattern,
  resolveCommutePattern,
} from "@/lib/activity-pattern";
import { calculateNutritionTargets } from "@/lib/nutrition-targets";

describe("flexible commute pattern", () => {
  it("averages twice-weekly cycling instead of treating it as daily", () => {
    const twiceWeekly = dailyCommutePatternKcal([
      { method: "cycling", daysPerWeek: 2, minutesOneWay: 20 },
    ]);
    const daily = dailyCommutePatternKcal([
      { method: "cycling", daysPerWeek: 7, minutesOneWay: 20 },
    ]);
    assert.equal(twiceWeekly, 40);
    assert.equal(daily, 140);
    assert.ok(twiceWeekly < daily);
  });

  it("treats walking and cycling differently from driving", () => {
    const walking = dailyCommuteEntryKcal({
      method: "walking",
      daysPerWeek: 5,
      minutesOneWay: 20,
    });
    const cycling = dailyCommuteEntryKcal({
      method: "cycling",
      daysPerWeek: 5,
      minutesOneWay: 20,
    });
    const driving = dailyCommuteEntryKcal({
      method: "driving",
      daysPerWeek: 5,
      minutesOneWay: 20,
    });
    assert.ok(walking > 0);
    assert.ok(cycling > walking);
    assert.equal(driving, 0);
  });

  it("supports mixed commute methods in one week", () => {
    const mixed = dailyCommutePatternKcal([
      { method: "cycling", daysPerWeek: 2, minutesOneWay: 20 },
      { method: "walking", daysPerWeek: 3, minutesOneWay: 15 },
      { method: "driving", daysPerWeek: 2, minutesOneWay: 30 },
    ]);
    const cycleOnly = dailyCommutePatternKcal([
      { method: "cycling", daysPerWeek: 2, minutesOneWay: 20 },
    ]);
    const walkOnly = dailyCommutePatternKcal([
      { method: "walking", daysPerWeek: 3, minutesOneWay: 15 },
    ]);
    assert.equal(mixed, cycleOnly + walkOnly);
  });

  it("does not invent calories when commute data is missing", () => {
    assert.equal(dailyCommutePatternKcal([]), 0);
    assert.equal(
      dailyCommuteEntryKcal({
        method: "cycling",
        daysPerWeek: 2,
        minutesOneWay: null,
      }),
      0,
    );
    assert.equal(
      dailyCycleCommuteKcal({ daysPerWeek: 0, minutesPerRide: 30 }),
      0,
    );
  });

  it("preserves legacy cycling fields when pattern JSON is empty", () => {
    const resolved = resolveCommutePattern({
      commutePattern: [],
      cycleCommuteDaysPerWeek: 2,
      cycleCommuteMinutes: 25,
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].method, "cycling");
    assert.equal(resolved[0].daysPerWeek, 2);
    assert.equal(resolved[0].minutesOneWay, 25);
  });

  it("prefers structured commute_pattern over legacy cycle fields", () => {
    const resolved = resolveCommutePattern({
      commutePattern: [
        { method: "walking", daysPerWeek: 4, minutesOneWay: 12 },
      ],
      cycleCommuteDaysPerWeek: 2,
      cycleCommuteMinutes: 25,
    });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].method, "walking");
  });

  it("parses commute_pattern JSON defensively", () => {
    const parsed = parseCommutePattern([
      { method: "cycling", daysPerWeek: 2, minutesOneWay: 20 },
      { method: "teleport", daysPerWeek: 3, minutesOneWay: 10 },
      { method: "driving", daysPerWeek: 0, minutesOneWay: 15 },
      null,
      "x",
    ]);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].method, "cycling");
  });

  it("raises automatic calorie targets for active commuting only", () => {
    const base = {
      age: 35,
      sex: "male",
      height_cm: 180,
      weight_kg: 80,
      primary_goal: "lean",
      activity_level: "light",
    };
    const without = calculateNutritionTargets(base);
    const withDrive = calculateNutritionTargets({
      ...base,
      commute_pattern: [
        { method: "driving", daysPerWeek: 5, minutesOneWay: 30 },
      ],
    });
    const withCycle = calculateNutritionTargets({
      ...base,
      commute_pattern: [
        { method: "cycling", daysPerWeek: 2, minutesOneWay: 25 },
      ],
    });
    assert.equal(without.status, "ok");
    assert.equal(withDrive.status, "ok");
    assert.equal(withCycle.status, "ok");
    if (
      without.status === "ok" &&
      withDrive.status === "ok" &&
      withCycle.status === "ok"
    ) {
      assert.equal(withDrive.targets.tdee, without.targets.tdee);
      assert.ok(withCycle.targets.tdee > without.targets.tdee);
    }
  });

  it("describes work-from-home without inventing transport", () => {
    const lines = describeActivityAssumptions({
      activityLevel: "sedentary",
      commuteSituation: "work_from_home",
      commutePattern: [],
    });
    assert.ok(lines.some((line) => /works from home/i.test(line)));
    assert.ok(!lines.some((line) => /cycling/i.test(line)));
  });

  it("explains mixed active travel in plain language", () => {
    const lines = describeActivityAssumptions({
      activityLevel: "light",
      commuteSituation: "commutes",
      commutePattern: [
        { method: "cycling", daysPerWeek: 2, minutesOneWay: 20 },
        { method: "walking", daysPerWeek: 3, minutesOneWay: 15 },
      ],
    });
    assert.ok(lines.some((line) => /Cycling/i.test(line)));
    assert.ok(lines.some((line) => /Walking/i.test(line)));
  });

  it("maps legacy cycle helpers into the new pattern model", () => {
    const legacy = commutePatternFromLegacyCycle({
      daysPerWeek: 2,
      minutesOneWay: 20,
    });
    assert.deepEqual(legacy, [
      { method: "cycling", daysPerWeek: 2, minutesOneWay: 20 },
    ]);
  });
});
