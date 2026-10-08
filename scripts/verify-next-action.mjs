/**
 * Lightweight verification of next-action scenarios.
 * Run: node scripts/verify-next-action.mjs
 *
 * Mirrors src/lib/next-action.ts priority rules for smoke coverage.
 */

function hourOf(now) {
  return now.getHours();
}

function hasMeal(logged, meal) {
  return logged.includes(meal);
}

function mealCandidate(meal, hour, logged) {
  if (hasMeal(logged, meal)) return null;

  if (meal === "breakfast") {
    const priority = hour < 11 ? 90 : hour < 14 ? 70 : hour < 16 ? 40 : 0;
    if (priority <= 0) return null;
    return { type: "breakfast", priority };
  }
  if (meal === "lunch") {
    const priority =
      hour < 11 ? 20 : hour < 15 ? 85 : hour < 17 ? 65 : hour < 19 ? 35 : 0;
    if (priority <= 0) return null;
    return { type: "lunch", priority };
  }
  if (meal === "snack") {
    if (!hasMeal(logged, "lunch") && hour < 14) return null;
    const priority = hour < 13 ? 10 : hour < 17 ? 55 : hour < 19 ? 35 : 0;
    if (priority <= 0) return null;
    return { type: "snack", priority };
  }
  if (meal === "dinner") {
    const priority = hour < 16 ? 15 : hour < 18 ? 50 : hour < 22 ? 88 : 60;
    if (priority <= 0) return null;
    return { type: "dinner", priority };
  }
  return null;
}

function resolveNextAction(input) {
  const hour = hourOf(input.now);
  const candidates = [];

  if (!input.hasCheckIn) {
    candidates.push({
      type: "morning_check_in",
      priority: hour < 12 ? 100 : hour < 17 ? 92 : 75,
    });
  }

  for (const meal of ["breakfast", "lunch", "snack", "dinner"]) {
    const c = mealCandidate(meal, hour, input.loggedMealTypes);
    if (c) candidates.push(c);
  }

  const trainingPlanned =
    input.plannedTraining === "strength" ||
    input.plannedTraining === "hiit" ||
    input.plannedTraining === "recovery";

  if (input.hasCheckIn && trainingPlanned && !input.hasTrainingSession) {
    candidates.push({
      type: "training",
      priority: hour >= 10 && hour < 20 ? 60 : 45,
    });
  }

  if (candidates.length === 0) {
    return { type: "all_caught_up" };
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

function at(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

const cases = [
  {
    name: "first visit morning",
    input: {
      now: at(8),
      hasCheckIn: false,
      plannedTraining: null,
      loggedMealTypes: [],
      hasTrainingSession: false,
    },
    expectType: "morning_check_in",
  },
  {
    name: "after check-in, breakfast not logged (morning)",
    input: {
      now: at(9),
      hasCheckIn: true,
      plannedTraining: "unsure",
      loggedMealTypes: [],
      hasTrainingSession: false,
    },
    expectType: "breakfast",
  },
  {
    name: "breakfast logged, lunch not (noon)",
    input: {
      now: at(12),
      hasCheckIn: true,
      plannedTraining: "rest",
      loggedMealTypes: ["breakfast"],
      hasTrainingSession: false,
    },
    expectType: "lunch",
  },
  {
    name: "lunch logged, snack nudge (afternoon)",
    input: {
      now: at(15),
      hasCheckIn: true,
      plannedTraining: "rest",
      loggedMealTypes: ["breakfast", "lunch"],
      hasTrainingSession: false,
    },
    expectType: "snack",
  },
  {
    name: "dinner not logged (evening)",
    input: {
      now: at(19),
      hasCheckIn: true,
      plannedTraining: "rest",
      loggedMealTypes: ["breakfast", "lunch", "snack"],
      hasTrainingSession: false,
    },
    expectType: "dinner",
  },
  {
    name: "all meals logged, no training",
    input: {
      now: at(20),
      hasCheckIn: true,
      plannedTraining: "rest",
      loggedMealTypes: ["breakfast", "lunch", "snack", "dinner"],
      hasTrainingSession: false,
    },
    expectType: "all_caught_up",
  },
  {
    name: "planned training incomplete afternoon",
    input: {
      now: at(14),
      hasCheckIn: true,
      plannedTraining: "strength",
      loggedMealTypes: ["breakfast", "lunch"],
      hasTrainingSession: false,
    },
    expectType: "training",
  },
  {
    name: "planned training wins over late snack",
    input: {
      now: at(16),
      hasCheckIn: true,
      plannedTraining: "strength",
      loggedMealTypes: ["breakfast", "lunch", "snack"],
      hasTrainingSession: false,
    },
    expectType: "training",
  },
  {
    name: "completed training + all meals",
    input: {
      now: at(21),
      hasCheckIn: true,
      plannedTraining: "strength",
      loggedMealTypes: ["breakfast", "lunch", "snack", "dinner"],
      hasTrainingSession: true,
    },
    expectType: "all_caught_up",
  },
  {
    name: "logged meal not reminded",
    input: {
      now: at(9),
      hasCheckIn: true,
      plannedTraining: null,
      loggedMealTypes: ["breakfast"],
      hasTrainingSession: false,
    },
    expectType: "lunch",
  },
];

let failed = 0;
for (const c of cases) {
  const result = resolveNextAction(c.input);
  const ok = result.type === c.expectType;
  console.log(
    `${ok ? "✓" : "✗"} ${c.name} → ${result.type}${ok ? "" : ` (expected ${c.expectType})`}`,
  );
  if (!ok) failed += 1;
}

{
  const result = resolveNextAction({
    now: at(9),
    hasCheckIn: true,
    plannedTraining: null,
    loggedMealTypes: ["breakfast"],
    hasTrainingSession: false,
  });
  const ok = result.type !== "breakfast";
  console.log(`${ok ? "✓" : "✗"} breakfast logged → not breakfast reminder`);
  if (!ok) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
console.log("\nAll next-action scenarios passed.");
