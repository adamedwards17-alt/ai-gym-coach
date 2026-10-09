/**
 * Smoke tests for resolveCoachMoment (UK windows + habit prompts).
 * Run: node scripts/verify-coach-moment.mjs
 *
 * The logic below MIRRORS src/lib/coach-moment.ts (minus training / copy
 * details). Keep both in sync when changing windows or scores.
 *
 * Windows (local clock):
 *   06:00–10:59 morning | 11:00–11:59 late_morning | 12:00–14:29 lunch
 *   14:30–17:29 afternoon | 17:30–20:59 evening | 21:00–05:59 night
 */

const MORNING_START = 6 * 60;
const LATE_MORNING_START = 11 * 60;
const LUNCH_START = 12 * 60;
const AFTERNOON_START = 14 * 60 + 30;
const EVENING_START = 17 * 60 + 30;
const NIGHT_START = 21 * 60;
const DINNER_PLANNING_START = 16 * 60;

const minutesOf = (d) => d.getHours() * 60 + d.getMinutes();

function resolveDayPhase(now) {
  const m = minutesOf(now);
  if (m >= MORNING_START && m < LATE_MORNING_START) return "morning";
  if (m >= LATE_MORNING_START && m < LUNCH_START) return "late_morning";
  if (m >= LUNCH_START && m < AFTERNOON_START) return "lunch";
  if (m >= AFTERNOON_START && m < EVENING_START) return "afternoon";
  if (m >= EVENING_START && m < NIGHT_START) return "evening";
  return "night";
}

const hasMeal = (logged, meal) => logged.includes(meal);

function mealScore(meal, minutes, logged) {
  if (hasMeal(logged, meal)) return 0;

  if (meal === "breakfast") {
    if (minutes < MORNING_START) return 0;
    if (minutes < LATE_MORNING_START) return 90;
    if (
      minutes < LUNCH_START &&
      !hasMeal(logged, "lunch") &&
      !hasMeal(logged, "dinner")
    ) {
      return 50;
    }
    return 0;
  }

  if (meal === "lunch") {
    if (minutes < LUNCH_START) return 0;
    if (minutes < AFTERNOON_START) return 88;
    if (minutes < DINNER_PLANNING_START) return 45;
    return 0;
  }

  if (meal === "snack") {
    if (minutes >= LATE_MORNING_START && minutes < LUNCH_START) {
      return hasMeal(logged, "breakfast") ? 60 : 0;
    }
    if (minutes >= AFTERNOON_START && minutes < EVENING_START) {
      return hasMeal(logged, "lunch") ? 62 : 30;
    }
    if (minutes >= EVENING_START && minutes < EVENING_START + 60) return 30;
    return 0;
  }

  // dinner
  if (minutes < DINNER_PLANNING_START) return 0;
  if (minutes < EVENING_START) return 45;
  if (minutes < NIGHT_START) return 90;
  return 0; // night = recap, never an outdated meal
}

function mealTitle(meal, minutes) {
  if (meal === "lunch") {
    return minutes < AFTERNOON_START
      ? "What’s on the menu for lunch?"
      : "Did you manage lunch today?";
  }
  if (meal === "breakfast") {
    return minutes < LATE_MORNING_START
      ? "What’s on the cards for breakfast?"
      : "Did you get breakfast in today?";
  }
  return meal;
}

const HABIT_SLOT_MEALS = new Set(["breakfast", "lunch", "dinner", "drink"]);

function pickHabit(habits, logged) {
  for (const habit of habits ?? []) {
    if (habit.negligibleCalories) continue;
    if (
      habit.mealType &&
      HABIT_SLOT_MEALS.has(habit.mealType) &&
      hasMeal(logged, habit.mealType)
    ) {
      continue;
    }
    return habit;
  }
  return null;
}

function resolveCoachMoment(input) {
  const hour = input.now.getHours();
  const minutes = minutesOf(input.now);
  const phase = resolveDayPhase(input.now);
  const candidates = [];
  let checkInPriority = null;

  if (!input.hasCheckIn && (phase === "morning" || phase === "late_morning")) {
    checkInPriority = phase === "morning" ? 100 : 85;
    candidates.push({ type: "morning_check_in", phase, priority: checkInPriority });
  } else if (!input.hasCheckIn && hour >= 6 && hour < 17) {
    checkInPriority = 70;
    candidates.push({ type: "morning_check_in", phase, priority: 70 });
  }

  for (const meal of ["breakfast", "lunch", "snack", "dinner"]) {
    const score = mealScore(meal, minutes, input.loggedMealTypes);
    if (score > 0) {
      candidates.push({
        type: meal,
        phase,
        priority: score,
        title: mealTitle(meal, minutes),
      });
    }
  }

  const habit = pickHabit(input.detectedHabits, input.loggedMealTypes);
  if (habit && phase !== "night" && minutes >= MORNING_START) {
    const priority =
      checkInPriority != null && checkInPriority >= 85
        ? Math.min(91, checkInPriority - 1)
        : 91;
    candidates.push({
      type: "habit",
      phase,
      priority,
      habitKey: habit.key,
      habitLabel: habit.label,
      habitDescription: habit.description,
      mealType: habit.mealType,
    });
  }

  if (input.nutrition?.targets) {
    const coreMealsLogged = ["breakfast", "lunch", "dinner"].every((m) =>
      hasMeal(input.loggedMealTypes, m),
    );
    candidates.push({
      type: "nutrition_observation",
      phase,
      priority: phase === "night" || coreMealsLogged ? 95 : 35,
    });
  }

  if (candidates.length === 0) return { type: "all_set", phase };
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}

function at(hour, minute = 0) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

const nutrition = { targets: { daily_calories: 2400, protein_g: 170 } };
const coffeeHabit = {
  key: "latte@8",
  label: "Latte",
  description: "Latte with oat milk",
  mealType: "drink",
  negligibleCalories: false,
};

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed += 1;
}

function expectType(name, input, type) {
  const r = resolveCoachMoment(input);
  check(name, r.type === type, `(got ${r.type}, expected ${type})`);
  return r;
}
function expectNotType(name, input, type) {
  const r = resolveCoachMoment(input);
  check(name, r.type !== type, `(got ${r.type}, expected not ${type})`);
  return r;
}

const base = { hasCheckIn: true, loggedMealTypes: [], nutrition };

// --- Phase boundaries -----------------------------------------------------
const phases = [
  [5, 59, "night"],
  [6, 0, "morning"],
  [10, 59, "morning"],
  [11, 0, "late_morning"],
  [11, 59, "late_morning"],
  [12, 0, "lunch"],
  [14, 29, "lunch"],
  [14, 30, "afternoon"],
  [17, 29, "afternoon"],
  [17, 30, "evening"],
  [20, 59, "evening"],
  [21, 0, "night"],
  [23, 59, "night"],
];
for (const [h, m, expected] of phases) {
  const got = resolveDayPhase(at(h, m));
  check(`phase ${h}:${String(m).padStart(2, "0")} → ${expected}`, got === expected, `(got ${got})`);
}

// --- Morning --------------------------------------------------------------
expectType("06:00 no check-in → check-in", { ...base, now: at(6), hasCheckIn: false }, "morning_check_in");
expectType("08:00 checked in, nothing logged → breakfast", { ...base, now: at(8) }, "breakfast");
expectNotType("08:00 breakfast logged → no breakfast", { ...base, now: at(8), loggedMealTypes: ["breakfast"] }, "breakfast");
expectType("10:59 breakfast not logged → breakfast", { ...base, now: at(10, 59) }, "breakfast");

// --- Late morning ---------------------------------------------------------
expectType("11:30 breakfast logged → snack", { ...base, now: at(11, 30), loggedMealTypes: ["breakfast"] }, "snack");
expectType("11:30 breakfast not logged → gentle breakfast", { ...base, now: at(11, 30) }, "breakfast");
expectNotType("11:30 lunch already logged → no breakfast", { ...base, now: at(11, 30), loggedMealTypes: ["lunch"] }, "breakfast");
expectNotType("11:30 snack logged → no snack", { ...base, now: at(11, 30), loggedMealTypes: ["breakfast", "snack"] }, "snack");

// --- Lunch ----------------------------------------------------------------
expectType("12:00 lunch not logged → lunch", { ...base, now: at(12), loggedMealTypes: ["breakfast"] }, "lunch");
expectNotType("12:00 lunch logged → no lunch", { ...base, now: at(12), loggedMealTypes: ["breakfast", "lunch"] }, "lunch");
expectNotType("13:00 lunch logged → never ask lunch", { ...base, now: at(13), loggedMealTypes: ["breakfast", "lunch"] }, "lunch");
{
  const r = expectType("14:29 lunch not logged → lunch", { ...base, now: at(14, 29), loggedMealTypes: ["breakfast"] }, "lunch");
  check("14:29 lunch copy is the standard prompt", r.title?.includes("menu for lunch"), `(${r.title})`);
}

// --- Afternoon ------------------------------------------------------------
{
  const r = expectType("14:30 late lunch → gentle lunch", { ...base, now: at(14, 30), loggedMealTypes: ["breakfast"] }, "lunch");
  check("14:30 late-lunch copy is gentler", r.title?.includes("Did you manage lunch"), `(${r.title})`);
}
expectType("15:00 lunch logged → snack", { ...base, now: at(15), loggedMealTypes: ["breakfast", "lunch"] }, "snack");
expectNotType("16:30 lunch no longer nagged", { ...base, now: at(16, 30), loggedMealTypes: ["breakfast"] }, "lunch");
expectType("16:30 lunch logged, no snack → snack", { ...base, now: at(16, 30), loggedMealTypes: ["breakfast", "lunch"] }, "snack");
expectNotType("17:29 breakfast not re-asked", { ...base, now: at(17, 29), loggedMealTypes: ["lunch"] }, "breakfast");

// --- Evening --------------------------------------------------------------
expectType("17:30 lunch logged → dinner", { ...base, now: at(17, 30), loggedMealTypes: ["breakfast", "lunch"] }, "dinner");
expectType("18:00 lunch logged dinner not → dinner", { ...base, now: at(18), loggedMealTypes: ["breakfast", "lunch"] }, "dinner");
expectType("18:00 breakfast+lunch+dinner logged → observation", { ...base, now: at(18), loggedMealTypes: ["breakfast", "lunch", "dinner"] }, "nutrition_observation");
expectType("20:59 dinner not logged → dinner", { ...base, now: at(20, 59), loggedMealTypes: ["breakfast", "lunch"] }, "dinner");

// --- Night (observation, not an outdated meal) -----------------------------
for (const [h, m] of [[21, 0], [22, 30], [23, 59], [2, 0]]) {
  expectType(`${h}:${String(m).padStart(2, "0")} dinner not logged → recap observation`, { ...base, now: at(h, m), loggedMealTypes: ["breakfast", "lunch"] }, "nutrition_observation");
}
expectNotType("21:00 never asks dinner", { ...base, now: at(21), loggedMealTypes: [] }, "dinner");
expectNotType("night without nutrition targets never asks a meal", { ...base, now: at(22), nutrition: null }, "dinner");

// --- Habits ---------------------------------------------------------------
{
  const r = expectType("08:00 habit beats generic breakfast", { ...base, now: at(8), detectedHabits: [coffeeHabit] }, "habit");
  check("habit carries key/label/description/mealType", r.habitKey === "latte@8" && r.habitLabel === "Latte" && r.habitDescription === "Latte with oat milk" && r.mealType === "drink");
}
expectType("07:00 morning check-in beats habit", { ...base, now: at(7), hasCheckIn: false, detectedHabits: [coffeeHabit] }, "morning_check_in");
expectType("11:30 late check-in beats habit", { ...base, now: at(11, 30), hasCheckIn: false, detectedHabits: [coffeeHabit] }, "morning_check_in");
expectNotType("negligible habit ignored", { ...base, now: at(8), detectedHabits: [{ ...coffeeHabit, negligibleCalories: true }] }, "habit");
expectNotType("habit skipped when its meal slot is logged", { ...base, now: at(8), loggedMealTypes: ["drink"], detectedHabits: [coffeeHabit] }, "habit");
expectNotType("no habit prompts at night", { ...base, now: at(21, 30), detectedHabits: [coffeeHabit] }, "habit");
expectType("habit beats generic lunch prompt", { ...base, now: at(12, 30), detectedHabits: [{ ...coffeeHabit, key: "shake@12", label: "Protein shake", mealType: "snack" }] }, "habit");
expectType("no habits → normal breakfast", { ...base, now: at(8), detectedHabits: [] }, "breakfast");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll coach-moment scenarios passed.");
