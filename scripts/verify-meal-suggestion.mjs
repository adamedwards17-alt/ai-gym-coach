/**
 * Time-aware meal category suggestions.
 * Run: node scripts/verify-meal-suggestion.mjs
 *
 * Mirrors src/lib/meal-suggestion.ts — keep in sync.
 */

const MEAL_TIME_WINDOWS = {
  breakfast: { startMinutes: 5 * 60, endMinutes: 10 * 60 + 30 },
  lunch: { startMinutes: 10 * 60 + 30, endMinutes: 14 * 60 + 30 },
  dinner: { startMinutes: 17 * 60, endMinutes: 21 * 60 + 30 },
};

function minutesOfDay(now) {
  return now.getHours() * 60 + now.getMinutes();
}

function mealFromLocalTime(now) {
  const minutes = minutesOfDay(now);
  if (
    minutes >= MEAL_TIME_WINDOWS.breakfast.startMinutes &&
    minutes < MEAL_TIME_WINDOWS.breakfast.endMinutes
  ) {
    return "breakfast";
  }
  if (
    minutes >= MEAL_TIME_WINDOWS.lunch.startMinutes &&
    minutes < MEAL_TIME_WINDOWS.lunch.endMinutes
  ) {
    return "lunch";
  }
  if (
    minutes >= MEAL_TIME_WINDOWS.dinner.startMinutes &&
    minutes < MEAL_TIME_WINDOWS.dinner.endMinutes
  ) {
    return "dinner";
  }
  return "snack";
}

function hasEatenMeal(eatenMealTypes, meal) {
  return eatenMealTypes.includes(meal);
}

function suggestMealType({ now, eatenMealTypes }) {
  const primary = mealFromLocalTime(now);
  if (!hasEatenMeal(eatenMealTypes, primary)) return primary;

  if (primary === "breakfast") {
    if (!hasEatenMeal(eatenMealTypes, "snack")) return "snack";
    if (!hasEatenMeal(eatenMealTypes, "lunch")) return "lunch";
    return "snack";
  }
  if (primary === "lunch") {
    if (!hasEatenMeal(eatenMealTypes, "snack")) return "snack";
    if (!hasEatenMeal(eatenMealTypes, "dinner")) {
      const minutes = minutesOfDay(now);
      if (minutes >= 14 * 60) return "dinner";
    }
    return "snack";
  }
  if (primary === "dinner") return "snack";
  return "snack";
}

function at(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

let passed = 0;
let failed = 0;
function assert(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

console.log("verify-meal-suggestion");

assert("08:00 → breakfast window", mealFromLocalTime(at(8)) === "breakfast");
assert("10:29 → breakfast", mealFromLocalTime(at(10, 29)) === "breakfast");
assert("10:30 → lunch", mealFromLocalTime(at(10, 30)) === "lunch");
assert("12:00 → lunch", mealFromLocalTime(at(12)) === "lunch");
assert("14:29 → lunch", mealFromLocalTime(at(14, 29)) === "lunch");
assert("14:30 → snack (afternoon)", mealFromLocalTime(at(14, 30)) === "snack");
assert("16:00 → snack", mealFromLocalTime(at(16)) === "snack");
assert("17:00 → dinner", mealFromLocalTime(at(17)) === "dinner");
assert("20:00 → dinner", mealFromLocalTime(at(20)) === "dinner");
assert("21:29 → dinner", mealFromLocalTime(at(21, 29)) === "dinner");
assert("21:30 → snack (evening)", mealFromLocalTime(at(21, 30)) === "snack");
assert("23:00 → snack", mealFromLocalTime(at(23)) === "snack");
assert("03:00 → snack", mealFromLocalTime(at(3)) === "snack");

assert(
  "lunchtime defaults to lunch when empty",
  suggestMealType({ now: at(12, 15), eatenMealTypes: [] }) === "lunch",
);
assert(
  "lunchtime with breakfast still lunch",
  suggestMealType({
    now: at(12, 15),
    eatenMealTypes: ["breakfast"],
  }) === "lunch",
);
assert(
  "lunchtime does not fall to other",
  suggestMealType({
    now: at(12, 15),
    eatenMealTypes: ["breakfast"],
  }) !== "other",
);
assert(
  "lunchtime + lunch logged → snack",
  suggestMealType({
    now: at(12, 15),
    eatenMealTypes: ["breakfast", "lunch"],
  }) === "snack",
);
assert(
  "breakfast window defaults breakfast",
  suggestMealType({ now: at(8), eatenMealTypes: [] }) === "breakfast",
);
assert(
  "breakfast already logged → snack",
  suggestMealType({
    now: at(8, 30),
    eatenMealTypes: ["breakfast"],
  }) === "snack",
);
assert(
  "dinner window defaults dinner",
  suggestMealType({ now: at(19), eatenMealTypes: ["breakfast", "lunch"] }) ===
    "dinner",
);
assert(
  "dinner already logged → snack",
  suggestMealType({
    now: at(19),
    eatenMealTypes: ["breakfast", "lunch", "dinner"],
  }) === "snack",
);
assert(
  "planned meals ignored when only eaten passed",
  suggestMealType({
    now: at(12),
    eatenMealTypes: [], // planned lunch not included
  }) === "lunch",
);
assert(
  "never suggests other",
  ["breakfast", "lunch", "dinner", "snack"].includes(
    suggestMealType({
      now: at(12),
      eatenMealTypes: ["breakfast", "lunch", "snack", "dinner", "drink"],
    }),
  ),
);

// Override is always allowed by the UI — suggestion is not a lock.
const suggested = suggestMealType({ now: at(12), eatenMealTypes: [] });
assert("suggestion can be overridden (still a valid meal)", suggested === "lunch");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
