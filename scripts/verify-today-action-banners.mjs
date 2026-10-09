/**
 * Today action banners — max two, Coach Moment driven.
 * Run: node scripts/verify-today-action-banners.mjs
 *
 * Mirrors src/lib/today-action-banners.ts + collectCoachMomentCandidates
 * meal/training/check-in paths. Keep in sync.
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
  if (meal === "dinner") {
    if (minutes < DINNER_PLANNING_START) return 0;
    if (minutes < EVENING_START) return 45;
    if (minutes < NIGHT_START) return 90;
    return 0;
  }
  return 0;
}

function labelForTrainingType(type) {
  const map = {
    strength: "Strength",
    hiit: "HIIT",
    cardio: "Cardio",
    sport: "Sport",
    recovery: "Recovery",
    other: "Other",
    rest: "Rest",
  };
  return map[type] ?? type;
}

function collectCoachMomentCandidates(input) {
  const hour = input.now.getHours();
  const minutes = minutesOf(input.now);
  const phase = resolveDayPhase(input.now);
  const candidates = [];

  if (!input.hasCheckIn && (phase === "morning" || phase === "late_morning")) {
    candidates.push({
      type: "morning_check_in",
      kind: "action",
      priority: phase === "morning" ? 100 : 85,
      title: "How are you feeling this morning?",
      description: "A quick recovery check sets up training and food for the day.",
    });
  } else if (!input.hasCheckIn && hour >= 6 && hour < 17) {
    candidates.push({
      type: "morning_check_in",
      kind: "action",
      priority: 70,
      title: "Start today’s check-in",
      description: "Still useful later in the day if you haven’t done it.",
    });
  }

  for (const meal of ["breakfast", "lunch", "snack", "dinner"]) {
    const score = mealScore(meal, minutes, input.loggedMealTypes);
    if (score > 0) {
      candidates.push({
        type: meal,
        kind: "meal_decision",
        priority: score,
        title: meal,
        description: null,
      });
    }
  }

  const trainingPlanned =
    input.plannedTraining === "strength" ||
    input.plannedTraining === "hiit" ||
    input.plannedTraining === "recovery" ||
    input.plannedTraining === "unsure";

  if (trainingPlanned && !input.hasTrainingSession && hour >= 8 && hour < 21) {
    candidates.push({
      type: "training",
      kind: "action",
      priority: hour >= 14 && hour < 18 ? 72 : 58,
      title: "Training is still on the plan today.",
      description: "Open Train when you’re ready.",
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates;
}

function incompleteTraining(entries) {
  return entries.filter(
    (entry) => entry.training_type !== "rest" && entry.status === "planned",
  );
}

function trainingBanner(entries, moment, now) {
  const incomplete = incompleteTraining(entries);
  if (incomplete.length === 0) return null;
  const first = incomplete[0];
  const typeLabel = labelForTrainingType(first.training_type).toLowerCase();
  const lateDay = now.getHours() >= 17;

  if (incomplete.length === 1) {
    return {
      id: `training:${first.id}`,
      title: lateDay
        ? `Log your completed ${typeLabel} workout.`
        : `You’ve got a ${typeLabel} workout planned today.`,
      kind: "training",
      priority: Math.max(moment.priority, 70),
    };
  }
  return {
    id: `training:multi:${incomplete.map((e) => e.id).sort().join(",")}`,
    title: lateDay
      ? `Log your remaining ${incomplete.length} sessions.`
      : `You’ve got ${incomplete.length} sessions still planned today.`,
    kind: "training",
    priority: Math.max(moment.priority, 70),
  };
}

function mealBanner(moment) {
  if (!["breakfast", "lunch", "snack", "dinner"].includes(moment.type)) {
    return null;
  }
  const meal = moment.type;
  const title =
    meal === "lunch"
      ? "Don’t forget to log your lunch."
      : meal === "breakfast"
        ? "Don’t forget to log your breakfast."
        : meal === "dinner"
          ? "Don’t forget to log your dinner."
          : "Don’t forget to log a snack if you’ve had one.";
  return {
    id: `meal:${meal}`,
    title,
    kind: "meal",
    priority: moment.priority,
  };
}

function checkInBanner(moment) {
  return {
    id: "check_in",
    title: "Complete today’s check-in",
    kind: "check_in",
    priority: moment.priority,
  };
}

function momentToBanner(moment, planEntries, now) {
  if (moment.kind === "observation") return null;
  if (moment.type === "morning_check_in") return checkInBanner(moment);
  if (moment.type === "training") return trainingBanner(planEntries, moment, now);
  return mealBanner(moment);
}

function resolveTodayActionBanners(input) {
  const max = input.maxBanners ?? 2;
  const dismissed = new Set(input.dismissedIds ?? []);
  const incomplete = incompleteTraining(input.planEntries);

  const momentInput = {
    ...input,
    hasTrainingSession: incomplete.length === 0,
    plannedTraining:
      incomplete.length > 0
        ? incomplete[0].training_type === "strength" ||
          incomplete[0].training_type === "hiit" ||
          incomplete[0].training_type === "recovery"
          ? incomplete[0].training_type
          : "unsure"
        : input.plannedTraining,
  };

  const candidates = collectCoachMomentCandidates(momentInput);
  const banners = [];
  const seenKinds = new Set();

  for (const moment of candidates) {
    const banner = momentToBanner(moment, input.planEntries, input.now);
    if (!banner) continue;
    if (dismissed.has(banner.id)) continue;
    if (banner.kind === "meal") {
      if ([...seenKinds].some((k) => k.startsWith("meal:"))) continue;
      seenKinds.add(`meal:${banner.id}`);
    } else if (seenKinds.has(banner.kind)) {
      continue;
    } else {
      seenKinds.add(banner.kind);
    }
    banners.push(banner);
    if (banners.length >= max) break;
  }
  return banners.slice(0, max);
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

console.log("verify-today-action-banners");

const strengthPlanned = [
  {
    id: "w1",
    title: "Upper",
    training_type: "strength",
    status: "planned",
    planned_duration_minutes: 45,
  },
];

// Lunch banner when due and missing
{
  const banners = resolveTodayActionBanners({
    now: at(12, 30),
    hasCheckIn: true,
    plannedTraining: null,
    loggedMealTypes: ["breakfast"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [],
  });
  assert("lunch banner shown at lunch when missing", banners.some((b) => b.id === "meal:lunch"));
  assert("lunch copy", banners.some((b) => b.title.includes("lunch")));
}

// Lunch suppressed after logged
{
  const banners = resolveTodayActionBanners({
    now: at(12, 30),
    hasCheckIn: true,
    plannedTraining: null,
    loggedMealTypes: ["breakfast", "lunch"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [],
  });
  assert("lunch suppressed after logged", !banners.some((b) => b.id === "meal:lunch"));
}

// Workout banner when planned incomplete
{
  const banners = resolveTodayActionBanners({
    now: at(10),
    hasCheckIn: true,
    plannedTraining: "strength",
    loggedMealTypes: ["breakfast"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: strengthPlanned,
  });
  assert(
    "workout banner when planned",
    banners.some((b) => b.kind === "training" && b.title.includes("strength")),
  );
}

// Workout banner removed after completion saved
{
  const banners = resolveTodayActionBanners({
    now: at(10),
    hasCheckIn: true,
    plannedTraining: "strength",
    loggedMealTypes: ["breakfast"],
    hasTrainingSession: true,
    nutrition: null,
    planEntries: [
      {
        id: "w1",
        title: "Upper",
        training_type: "strength",
        status: "completed",
        planned_duration_minutes: 45,
      },
    ],
  });
  assert("no workout banner after completed", !banners.some((b) => b.kind === "training"));
}

// Multiple planned — only incomplete remain
{
  const banners = resolveTodayActionBanners({
    now: at(15),
    hasCheckIn: true,
    plannedTraining: "hiit",
    loggedMealTypes: ["breakfast", "lunch"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [
      {
        id: "w1",
        title: "Upper",
        training_type: "strength",
        status: "completed",
        planned_duration_minutes: 45,
      },
      {
        id: "w2",
        title: "Intervals",
        training_type: "hiit",
        status: "planned",
        planned_duration_minutes: 30,
      },
    ],
  });
  const training = banners.find((b) => b.kind === "training");
  assert("partial multi still shows remaining", !!training);
  assert("partial multi mentions hiit", training?.title.includes("hiit"));
}

// Skipped workout — no completion nag
{
  const banners = resolveTodayActionBanners({
    now: at(15),
    hasCheckIn: true,
    plannedTraining: "strength",
    loggedMealTypes: ["breakfast", "lunch"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [
      {
        id: "w1",
        title: "Upper",
        training_type: "strength",
        status: "skipped",
        planned_duration_minutes: 45,
      },
    ],
  });
  assert("skipped workout no training banner", !banners.some((b) => b.kind === "training"));
}

// Dismissal persistence for the day
{
  const banners = resolveTodayActionBanners({
    now: at(12, 30),
    hasCheckIn: true,
    plannedTraining: null,
    loggedMealTypes: ["breakfast"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [],
    dismissedIds: ["meal:lunch"],
  });
  assert("dismissed lunch stays gone", !banners.some((b) => b.id === "meal:lunch"));
}

// Max two banners
{
  const banners = resolveTodayActionBanners({
    now: at(8),
    hasCheckIn: false,
    plannedTraining: "strength",
    loggedMealTypes: [],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: strengthPlanned,
    maxBanners: 2,
  });
  assert("never more than two banners", banners.length <= 2);
  assert("check-in included when due", banners.some((b) => b.kind === "check_in"));
}

// No invented workout when none planned
{
  const banners = resolveTodayActionBanners({
    now: at(15),
    hasCheckIn: true,
    plannedTraining: null,
    loggedMealTypes: ["breakfast", "lunch"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [],
  });
  assert("no invented workout banner", !banners.some((b) => b.kind === "training"));
}

// Premature lunch not shown in morning
{
  const banners = resolveTodayActionBanners({
    now: at(8),
    hasCheckIn: true,
    plannedTraining: null,
    loggedMealTypes: [],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [],
  });
  assert("no premature lunch in morning", !banners.some((b) => b.id === "meal:lunch"));
  assert("breakfast shown in morning", banners.some((b) => b.id === "meal:breakfast"));
}

// Late-day log-completed copy
{
  const banners = resolveTodayActionBanners({
    now: at(18),
    hasCheckIn: true,
    plannedTraining: "strength",
    loggedMealTypes: ["breakfast", "lunch"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: strengthPlanned,
  });
  const training = banners.find((b) => b.kind === "training");
  assert(
    "late day uses log-completed copy",
    !!training && training.title.includes("Log your completed"),
  );
}

// Local day boundary: night does not ask outdated lunch
{
  const banners = resolveTodayActionBanners({
    now: at(22),
    hasCheckIn: true,
    plannedTraining: null,
    loggedMealTypes: ["breakfast"],
    hasTrainingSession: false,
    nutrition: null,
    planEntries: [],
  });
  assert("night does not nag lunch", !banners.some((b) => b.id === "meal:lunch"));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
