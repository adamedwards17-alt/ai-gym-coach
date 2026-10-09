/**
 * Profile / goals / weekly check-in / weight helpers.
 * Run: node scripts/verify-profile-goals-progress.mjs
 *
 * Mirrors src/lib/goal-history.ts, weight-measurements.ts, weekly-check-ins.ts.
 */

function daysBetweenLocalDates(from, to) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = new Date(fy, fm - 1, fd);
  const b = new Date(ty, tm - 1, td);
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)));
}

function evaluateGoalChangeWarning({
  currentGoal,
  nextGoal,
  goalStartedAt,
  today,
}) {
  if (!currentGoal || !nextGoal || currentGoal === nextGoal) {
    return { shouldWarn: false, daysOnPlan: 0, message: null };
  }
  if (!goalStartedAt) {
    return { shouldWarn: false, daysOnPlan: 0, message: null };
  }
  const daysOnPlan = daysBetweenLocalDates(goalStartedAt, today);
  if (daysOnPlan >= 14) {
    return { shouldWarn: false, daysOnPlan, message: null };
  }
  return {
    shouldWarn: true,
    daysOnPlan,
    message: `You've been following your current plan for ${daysOnPlan} day${
      daysOnPlan === 1 ? "" : "s"
    }.`,
  };
}

function latestWeightKg(measurements) {
  if (measurements.length === 0) return null;
  const sorted = [...measurements].sort((a, b) => {
    if (a.measured_on !== b.measured_on) {
      return b.measured_on.localeCompare(a.measured_on);
    }
    return b.created_at.localeCompare(a.created_at);
  });
  return sorted[0]?.weight_kg ?? null;
}

function weightTrendKg(measurements, asOfDate) {
  if (measurements.length < 2) return null;
  const sorted = [...measurements].sort((a, b) =>
    a.measured_on.localeCompare(b.measured_on),
  );
  const latest = [...sorted].reverse().find((m) => m.measured_on <= asOfDate);
  if (!latest) return null;
  const [y, m, d] = asOfDate.split("-").map(Number);
  const weekAgoDate = new Date(y, m - 1, d - 7);
  const weekAgo = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(weekAgoDate);
  const earlier =
    [...sorted].reverse().find((e) => e.measured_on <= weekAgo) ?? sorted[0];
  if (!earlier || earlier.id === latest.id) return null;
  return Math.round((latest.weight_kg - earlier.weight_kg) * 10) / 10;
}

function startOfWeekMonday(localDate) {
  const [y, m, d] = localDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isWeeklyCheckInDue({ today, latestCompletedWeekStart }) {
  const thisWeek = startOfWeekMonday(today);
  if (!latestCompletedWeekStart) return true;
  return latestCompletedWeekStart < thisWeek;
}

function lowAdherence(level) {
  return level === "some_of_the_time" || level === "not_much";
}

function buildWeeklyRecommendation(input) {
  const leanGoal = input.primaryGoal === "lean" || input.primaryGoal === "recomp";
  if (
    lowAdherence(input.nutritionAdherence) ||
    lowAdherence(input.trainingAdherence)
  ) {
    return { kind: "improve_consistency", proposedCalories: null };
  }
  if (input.recovery === "didnt_train") {
    return { kind: "adjust_training", proposedCalories: null };
  }
  if (input.weighInCountLast14Days < 2 || input.daysOnPlan < 10) {
    return { kind: "inconclusive", proposedCalories: null };
  }
  const trend = input.weightTrendKg;
  const hungry = (input.hunger ?? 0) >= 4;
  const lowEnergy = (input.energy ?? 5) <= 2;
  if (
    leanGoal &&
    trend != null &&
    trend <= -0.8 &&
    (hungry || lowEnergy) &&
    input.currentCalories != null
  ) {
    return {
      kind: "adjust_nutrition",
      proposedCalories: Math.min(
        Math.round(input.currentCalories + 150),
        input.currentCalories + 250,
      ),
    };
  }
  return { kind: "keep_plan", proposedCalories: null };
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

console.log("Profile / goals / progress verification\n");

assert(
  "goal warn under 14 days",
  evaluateGoalChangeWarning({
    currentGoal: "lean",
    nextGoal: "muscle",
    goalStartedAt: "2026-10-01",
    today: "2026-10-09",
  }).shouldWarn === true,
);

assert(
  "goal no warn after 14 days",
  evaluateGoalChangeWarning({
    currentGoal: "lean",
    nextGoal: "muscle",
    goalStartedAt: "2026-09-01",
    today: "2026-10-09",
  }).shouldWarn === false,
);

assert(
  "goal no warn same goal",
  evaluateGoalChangeWarning({
    currentGoal: "lean",
    nextGoal: "lean",
    goalStartedAt: "2026-10-01",
    today: "2026-10-09",
  }).shouldWarn === false,
);

const weights = [
  {
    id: "a",
    measured_on: "2026-10-01",
    weight_kg: 90,
    created_at: "2026-10-01T10:00:00Z",
  },
  {
    id: "b",
    measured_on: "2026-10-08",
    weight_kg: 89.2,
    created_at: "2026-10-08T10:00:00Z",
  },
];
assert("latest weight", latestWeightKg(weights) === 89.2);
assert("weight trend down", weightTrendKg(weights, "2026-10-09") === -0.8);

assert(
  "week start monday from wednesday",
  startOfWeekMonday("2026-10-09") === "2026-10-05",
);

assert(
  "check-in due when never completed",
  isWeeklyCheckInDue({ today: "2026-10-09", latestCompletedWeekStart: null }) ===
    true,
);

assert(
  "check-in not due same week",
  isWeeklyCheckInDue({
    today: "2026-10-09",
    latestCompletedWeekStart: "2026-10-05",
  }) === false,
);

assert(
  "low adherence → improve consistency",
  buildWeeklyRecommendation({
    primaryGoal: "lean",
    daysOnPlan: 30,
    weighInCountLast14Days: 4,
    weightTrendKg: 0,
    currentCalories: 2200,
    hunger: 3,
    energy: 3,
    nutritionAdherence: "not_much",
    trainingAdherence: "most_of_the_time",
    recovery: "normal",
  }).kind === "improve_consistency",
);

assert(
  "rapid loss + hunger → adjust nutrition",
  buildWeeklyRecommendation({
    primaryGoal: "lean",
    daysOnPlan: 30,
    weighInCountLast14Days: 4,
    weightTrendKg: -1.0,
    currentCalories: 2000,
    hunger: 5,
    energy: 3,
    nutritionAdherence: "almost_entirely",
    trainingAdherence: "most_of_the_time",
    recovery: "normal",
  }).kind === "adjust_nutrition",
);

assert(
  "insufficient data → inconclusive",
  buildWeeklyRecommendation({
    primaryGoal: "lean",
    daysOnPlan: 5,
    weighInCountLast14Days: 1,
    weightTrendKg: null,
    currentCalories: 2000,
    hunger: 3,
    energy: 3,
    nutritionAdherence: "almost_entirely",
    trainingAdherence: "almost_entirely",
    recovery: "normal",
  }).kind === "inconclusive",
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
