/**
 * Tests for training week helpers, categories, completion de-dupe, Coach facts.
 * Run: node scripts/verify-training-hub.mjs
 *
 * MIRRORS src/lib/training.ts + src/lib/training-week.ts — keep in sync.
 */

const trainingTypeOptions = [
  { id: "strength", label: "Strength" },
  { id: "hiit", label: "HIIT" },
  { id: "cardio", label: "Cardio" },
  { id: "sport", label: "Sport" },
  { id: "recovery", label: "Recovery" },
  { id: "other", label: "Other" },
];

const planTrainingTypeOptions = [
  ...trainingTypeOptions,
  { id: "rest", label: "Rest" },
];

const intensityOptions = [
  { id: "easy", label: "Easy" },
  { id: "moderate", label: "Moderate" },
  { id: "hard", label: "Hard" },
  { id: "very_hard", label: "Very hard" },
];

const DEFAULT_WEEKLY_SESSION_TARGET = 3;

function parseLocalDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfWeekMonday(localDate) {
  const date = parseLocalDate(localDate);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function addDays(localDate, days) {
  const date = parseLocalDate(localDate);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function endOfWeekSunday(localDate) {
  return addDays(startOfWeekMonday(localDate), 6);
}

function isTrainingSessionType(type) {
  return type !== "rest";
}

function buildWeeklyTrainingProgress({
  localDate,
  target,
  planEntries,
  sessions,
}) {
  const weekStart = startOfWeekMonday(localDate);
  const weekEnd = endOfWeekSunday(localDate);
  const inWeek = (date) => date >= weekStart && date <= weekEnd;

  const weekPlans = planEntries.filter((e) => inWeek(e.plan_date));
  const weekSessions = sessions.filter((s) => inWeek(s.session_date));
  const activePlans = weekPlans.filter((e) => e.status !== "rescheduled");

  const plannedSessionEntries = activePlans.filter((e) =>
    isTrainingSessionType(e.training_type),
  );
  const restDays = activePlans.filter((e) => e.training_type === "rest").length;
  const plannedSessions = plannedSessionEntries.length;
  const completedPlannedSessions = plannedSessionEntries.filter(
    (e) => e.status === "completed",
  ).length;

  const linkedSessionIds = new Set(
    plannedSessionEntries
      .map((e) => e.training_session_id)
      .filter((id) => typeof id === "string"),
  );

  let unplannedSessions = 0;
  for (const session of weekSessions) {
    if (linkedSessionIds.has(session.id)) continue;
    unplannedSessions += 1;
  }

  const completedSessions = completedPlannedSessions + unplannedSessions;
  const resolvedTarget = Math.max(1, Math.round(target));
  const fillPercent = Math.min(
    100,
    Math.round((completedPlannedSessions / resolvedTarget) * 100),
  );

  return {
    weekStart,
    weekEnd,
    plannedSessions,
    completedPlannedSessions,
    completedSessions,
    unplannedSessions,
    restDays,
    target: resolvedTarget,
    fillPercent,
    achieved: completedPlannedSessions >= resolvedTarget,
  };
}

function todayPlanStatus({ plan, hasSessionToday }) {
  if (plan?.training_type === "rest") return "rest";
  if (plan?.status === "completed") return "completed";
  if (plan?.status === "skipped") return "skipped";
  if (plan?.status === "planned") return "planned";
  if (hasSessionToday) return "completed";
  return "unplanned";
}

function defaultWeeklySessionTargetFromFrequency(frequency) {
  switch (frequency) {
    case "0-1":
      return 1;
    case "2-3":
      return 3;
    case "4-5":
      return 4;
    case "6+":
      return 6;
    default:
      return DEFAULT_WEEKLY_SESSION_TARGET;
  }
}

function resolveWeeklySessionTarget(stored, frequency) {
  if (
    typeof stored === "number" &&
    Number.isFinite(stored) &&
    stored >= 1 &&
    stored <= 14
  ) {
    return Math.round(stored);
  }
  return defaultWeeklySessionTargetFromFrequency(frequency);
}

function parseCaloriesBurned(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 5000) return null;
  return rounded;
}

function isTrainingTypeId(value) {
  return trainingTypeOptions.some((o) => o.id === value);
}

function isPlanTrainingTypeId(value) {
  return value === "rest" || isTrainingTypeId(value);
}

function completePlannedSession(state, planId, sessionPayload) {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan || plan.training_type === "rest") {
    return { ok: false, reason: "invalid" };
  }
  if (plan.training_session_id) {
    const existing = state.sessions.find((s) => s.id === plan.training_session_id);
    Object.assign(existing, sessionPayload);
    plan.status = "completed";
    return { ok: true, sessionId: existing.id, created: false };
  }
  const session = {
    id: `s-${state.sessions.length + 1}`,
    ...sessionPayload,
  };
  state.sessions.push(session);
  plan.training_session_id = session.id;
  plan.status = "completed";
  return { ok: true, sessionId: session.id, created: true };
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

console.log("verify-training-hub");

assert(
  "no F45 category id",
  !trainingTypeOptions.some((o) => o.id === "f45" || /f45/i.test(o.label)),
);
assert(
  "HIIT is present",
  trainingTypeOptions.some((o) => o.id === "hiit" && o.label === "HIIT"),
);
assert(
  "plan includes Rest",
  planTrainingTypeOptions.some((o) => o.id === "rest"),
);
assert("generic category count", trainingTypeOptions.length === 6);
assert("plan category count", planTrainingTypeOptions.length === 7);
assert("reject F45 as type", isTrainingTypeId("f45") === false);
assert("accept strength", isTrainingTypeId("strength") === true);
assert("rest is plan-only", isPlanTrainingTypeId("rest") && !isTrainingTypeId("rest"));

assert("intensity options", intensityOptions.length === 4);
assert("calories null ok", parseCaloriesBurned(null) === null);
assert("calories empty ok", parseCaloriesBurned("") === null);
assert("calories valid", parseCaloriesBurned(350) === 350);
assert("calories reject negative", parseCaloriesBurned(-1) === null);
assert("calories reject huge", parseCaloriesBurned(6000) === null);

assert("week start Mon for Wed", startOfWeekMonday("2026-10-07") === "2026-10-05");
assert("week end Sun", endOfWeekSunday("2026-10-07") === "2026-10-11");
assert("Sunday belongs to prior Mon week", startOfWeekMonday("2026-10-11") === "2026-10-05");

assert("freq 2-3 → 3", resolveWeeklySessionTarget(null, "2-3") === 3);
assert("freq 4-5 → 4", resolveWeeklySessionTarget(null, "4-5") === 4);
assert("freq 6+ → 6", resolveWeeklySessionTarget(null, "6+") === 6);
assert("stored overrides frequency", resolveWeeklySessionTarget(5, "2-3") === 5);

const weekPlans = [
  {
    id: "p1",
    plan_date: "2026-10-05",
    training_type: "strength",
    status: "completed",
    training_session_id: "s1",
    planned_duration_minutes: 45,
  },
  {
    id: "p2",
    plan_date: "2026-10-06",
    training_type: "rest",
    status: "planned",
    training_session_id: null,
    planned_duration_minutes: null,
  },
  {
    id: "p3",
    plan_date: "2026-10-07",
    training_type: "hiit",
    status: "planned",
    training_session_id: null,
    planned_duration_minutes: 30,
  },
];

const weekSessions = [
  { id: "s1", session_date: "2026-10-05", duration_minutes: 45 },
  { id: "s2", session_date: "2026-10-08", duration_minutes: 40 },
  { id: "s3", session_date: "2026-10-08", duration_minutes: 20 },
];

const progress = buildWeeklyTrainingProgress({
  localDate: "2026-10-07",
  target: 3,
  planEntries: weekPlans,
  sessions: weekSessions,
});

assert("planned sessions exclude rest", progress.plannedSessions === 2);
assert("rest day counted separately", progress.restDays === 1);
assert("completed planned = 1", progress.completedPlannedSessions === 1);
assert("unplanned counted separately", progress.unplannedSessions === 2);
assert("fill percent vs target 3", progress.fillPercent === 33);
assert("not yet achieved", progress.achieved === false);

const afterComplete = buildWeeklyTrainingProgress({
  localDate: "2026-10-07",
  target: 3,
  planEntries: [
    ...weekPlans.filter((p) => p.id !== "p3"),
    {
      id: "p3",
      plan_date: "2026-10-07",
      training_type: "hiit",
      status: "completed",
      training_session_id: "s4",
      planned_duration_minutes: 30,
    },
  ],
  sessions: [
    ...weekSessions,
    { id: "s4", session_date: "2026-10-07", duration_minutes: 30 },
  ],
});
assert(
  "no double count on plan completion",
  afterComplete.completedPlannedSessions === 2 &&
    afterComplete.unplannedSessions === 2,
);

assert(
  "rest status",
  todayPlanStatus({
    plan: { training_type: "rest", status: "planned" },
    hasSessionToday: false,
  }) === "rest",
);
assert(
  "planned status",
  todayPlanStatus({
    plan: { training_type: "strength", status: "planned" },
    hasSessionToday: false,
  }) === "planned",
);
assert(
  "completed via plan",
  todayPlanStatus({
    plan: { training_type: "strength", status: "completed" },
    hasSessionToday: false,
  }) === "completed",
);
assert(
  "skipped status",
  todayPlanStatus({
    plan: { training_type: "strength", status: "skipped" },
    hasSessionToday: false,
  }) === "skipped",
);
assert(
  "unplanned empty",
  todayPlanStatus({ plan: null, hasSessionToday: false }) === "unplanned",
);

const state = {
  plans: [
    {
      id: "pA",
      training_type: "cardio",
      status: "planned",
      training_session_id: null,
    },
  ],
  sessions: [],
};
const first = completePlannedSession(state, "pA", {
  session_date: "2026-10-09",
  title: "Run",
  duration_minutes: 30,
});
const second = completePlannedSession(state, "pA", {
  session_date: "2026-10-09",
  title: "Run",
  duration_minutes: 35,
});
assert("first completion creates session", first.created === true);
assert("second completion updates same session", second.created === false);
assert("only one session row", state.sessions.length === 1);
assert("plan linked", state.plans[0].training_session_id === first.sessionId);
assert("plan marked completed", state.plans[0].status === "completed");
assert("duration updated on re-complete", state.sessions[0].duration_minutes === 35);

function formatPlan(plan) {
  if (!plan) return "none planned";
  return `${plan.trainingType} — ${plan.title} [${plan.status}]`;
}
assert(
  "coach shows planned not invented complete",
  formatPlan({
    trainingType: "HIIT",
    title: "Intervals",
    status: "planned",
  }).includes("[planned]"),
);
assert(
  "coach shows completed distinctly",
  formatPlan({
    trainingType: "Strength",
    title: "Upper",
    status: "completed",
  }).includes("[completed]"),
);
assert("coach empty plan", formatPlan(null) === "none planned");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
