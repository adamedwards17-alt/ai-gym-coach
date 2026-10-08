/**
 * Smoke tests for resolveCoachMoment scenarios.
 * Run: node scripts/verify-coach-moment.mjs
 */

function hasMeal(logged, meal) {
  return logged.includes(meal);
}

function mealScore(meal, hour, logged) {
  if (hasMeal(logged, meal)) return 0;
  if (meal === "breakfast") {
    if (hour < 11) return 90;
    if (hour < 14) return 55;
    return 0;
  }
  if (meal === "lunch") {
    if (hour < 11) return 15;
    if (hour < 15) return 88;
    if (hour < 17) return 40;
    return 0;
  }
  if (meal === "snack") {
    if (!hasMeal(logged, "lunch") && hour < 14) return 0;
    if (hour >= 14 && hour < 17) return 62;
    if (hour >= 17 && hour < 19) return 35;
    return 0;
  }
  if (hour < 16) return 10;
  if (hour < 18) return 55;
  if (hour < 22) return 90;
  return 50;
}

function resolveCoachMoment(input) {
  const hour = input.now.getHours();
  const candidates = [];
  const meals = ["breakfast", "lunch", "snack", "dinner"];

  if (!input.hasCheckIn && hour < 12) {
    candidates.push({ type: "morning_check_in", priority: 100 });
  }

  for (const meal of meals) {
    const score = mealScore(meal, hour, input.loggedMealTypes);
    if (score > 0) {
      candidates.push({
        type: meal,
        priority: score,
        showInspirationCta: true,
      });
    }
  }

  const allMealsLogged = meals.every((m) => hasMeal(input.loggedMealTypes, m));
  if (input.nutrition?.targets && allMealsLogged) {
    candidates.push({
      type: "nutrition_observation",
      priority: 95,
      showInspirationCta: false,
    });
  } else if (input.nutrition?.targets && candidates.length === 0) {
    candidates.push({
      type: "nutrition_observation",
      priority: 35,
      showInspirationCta: true,
    });
  }

  if (candidates.length === 0) {
    return { type: "all_set" };
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

function at(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}

const nutrition = {
  targets: { daily_calories: 2400, protein_g: 170 },
};

const cases = [
  {
    name: "18:00 lunch logged dinner not",
    input: {
      now: at(18),
      hasCheckIn: true,
      loggedMealTypes: ["breakfast", "lunch"],
      nutrition,
    },
    expect: "dinner",
  },
  {
    name: "18:00 lunch + dinner logged",
    input: {
      now: at(18),
      hasCheckIn: true,
      loggedMealTypes: ["breakfast", "lunch", "snack", "dinner"],
      nutrition,
    },
    expect: "nutrition_observation",
  },
  {
    name: "13:00 lunch not logged",
    input: {
      now: at(13),
      hasCheckIn: true,
      loggedMealTypes: ["breakfast"],
      nutrition,
    },
    expect: "lunch",
  },
  {
    name: "13:00 lunch logged",
    input: {
      now: at(13),
      hasCheckIn: true,
      loggedMealTypes: ["breakfast", "lunch"],
      nutrition,
    },
    expectNot: "lunch",
  },
  {
    name: "16:00 lunch logged no snack",
    input: {
      now: at(16),
      hasCheckIn: true,
      loggedMealTypes: ["breakfast", "lunch"],
      nutrition,
    },
    expect: "snack",
  },
  {
    name: "all meals logged",
    input: {
      now: at(20),
      hasCheckIn: true,
      loggedMealTypes: ["breakfast", "lunch", "snack", "dinner"],
      nutrition,
    },
    expect: "nutrition_observation",
  },
];

let failed = 0;
for (const c of cases) {
  const result = resolveCoachMoment(c.input);
  let ok = true;
  if (c.expect && result.type !== c.expect) ok = false;
  if (c.expectNot && result.type === c.expectNot) ok = false;
  console.log(
    `${ok ? "✓" : "✗"} ${c.name} → ${result.type}${
      ok ? "" : ` (expected ${c.expect ?? `not ${c.expectNot}`})`
    }`,
  );
  if (!ok) failed += 1;
}

// Never ask lunch when lunch is logged at 13:00
{
  const result = resolveCoachMoment({
    now: at(13),
    hasCheckIn: true,
    loggedMealTypes: ["breakfast", "lunch"],
    nutrition,
  });
  const ok = result.type !== "lunch";
  console.log(`${ok ? "✓" : "✗"} never ask lunch when already logged`);
  if (!ok) failed += 1;
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll coach-moment scenarios passed.");
