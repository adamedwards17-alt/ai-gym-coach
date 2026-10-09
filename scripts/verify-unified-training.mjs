/**
 * Unified training: planned-vs-actual, skip, multi-day plan, proposals, constraints.
 * Run: node scripts/verify-unified-training.mjs
 */

// Mirror helpers (keep in sync with src/lib/training-plan.ts + training-week.ts)

const skipReasonOptions = [
  "too_busy",
  "low_energy",
  "sore_recovery",
  "away_travelling",
  "not_motivated",
  "other",
];

function buildPlannedVsActual({ plan, session }) {
  const rows = [];
  if (plan.planned_duration_minutes != null && session?.duration_minutes != null) {
    rows.push({
      metric: "Duration",
      planned: `${plan.planned_duration_minutes} min`,
      actual: `${session.duration_minutes} min`,
    });
  }
  if (session?.intensity) {
    rows.push({
      metric: "Intensity",
      planned: "Not specified",
      actual: session.intensity,
    });
  }
  const durationDeltaMinutes =
    plan.planned_duration_minutes != null && session?.duration_minutes != null
      ? session.duration_minutes - plan.planned_duration_minutes
      : null;
  return {
    title: plan.title,
    plannedDate: plan.original_plan_date ?? plan.plan_date,
    actualDate: session?.session_date ?? null,
    rows,
    durationDeltaMinutes,
  };
}

function formatLocalDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function startOfWeekMonday(localDate) {
  const [y, m, d] = localDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

function addDays(localDate, days) {
  const [y, m, d] = localDate.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return formatLocalDate(date);
}

function endOfWeekSunday(localDate) {
  return addDays(startOfWeekMonday(localDate), 6);
}

function buildWeeklyTrainingProgress({ localDate, target, planEntries, sessions }) {
  const weekStart = startOfWeekMonday(localDate);
  const weekEnd = endOfWeekSunday(localDate);
  const inWeek = (date) => date >= weekStart && date <= weekEnd;
  const weekPlans = planEntries.filter((e) => inWeek(e.plan_date));
  const weekSessions = sessions.filter((s) => inWeek(s.session_date));
  const activePlans = weekPlans.filter((e) => e.status !== "rescheduled");
  const plannedSessionEntries = activePlans.filter((e) => e.training_type !== "rest");
  const completedPlannedSessions = plannedSessionEntries.filter(
    (e) => e.status === "completed",
  ).length;
  const skippedSessions = plannedSessionEntries.filter(
    (e) => e.status === "skipped",
  ).length;
  const linked = new Set(
    plannedSessionEntries.map((e) => e.training_session_id).filter(Boolean),
  );
  let unplannedSessions = 0;
  for (const session of weekSessions) {
    if (!linked.has(session.id)) unplannedSessions += 1;
  }
  const resolvedTarget = Math.max(1, Math.round(target));
  return {
    plannedSessions: plannedSessionEntries.length,
    completedPlannedSessions,
    skippedSessions,
    unplannedSessions,
    restDays: activePlans.filter((e) => e.training_type === "rest").length,
    fillPercent: Math.min(
      100,
      Math.round((completedPlannedSessions / resolvedTarget) * 100),
    ),
  };
}

function parsePlanProposalChanges(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      entryId: item.entry_id || item.entryId,
      action: item.action,
      toDate: item.to_date || item.toDate || null,
    }))
    .filter((c) => c.entryId && c.action)
    .slice(0, 12);
}

function activeConstraintsForDate(constraints, localDate) {
  return constraints.filter(
    (c) => c.active && c.start_date <= localDate && c.end_date >= localDate,
  );
}

/** Simulate accept once — repeated taps no-op after accepted. */
function acceptProposal(store, proposalId) {
  const proposal = store.proposals.find((p) => p.id === proposalId);
  if (!proposal) return { ok: false };
  if (proposal.status === "accepted") return { ok: true, duplicate: true };
  if (proposal.status !== "pending") return { ok: false };
  for (const change of proposal.changes) {
    const entry = store.plans.find((p) => p.id === change.entryId);
    if (!entry) continue;
    if (change.action === "move" && change.toDate) {
      entry.original_plan_date = entry.original_plan_date || entry.plan_date;
      entry.plan_date = change.toDate;
      entry.status = "planned";
    }
    if (change.action === "skip") entry.status = "skipped";
  }
  proposal.status = "accepted";
  return { ok: true, duplicate: false };
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

console.log("verify-unified-training");

assert("skip reasons include too_busy", skipReasonOptions.includes("too_busy"));
assert("no F45 category in skip reasons", !skipReasonOptions.includes("f45"));

const comparison = buildPlannedVsActual({
  plan: {
    title: "Upper-body strength",
    plan_date: "2026-10-09",
    original_plan_date: "2026-10-07",
    planned_duration_minutes: 45,
  },
  session: {
    session_date: "2026-10-09",
    duration_minutes: 52,
    intensity: "hard",
  },
});
assert("comparison has duration row", comparison.rows.some((r) => r.metric === "Duration"));
assert("duration delta +7", comparison.durationDeltaMinutes === 7);
assert("preserves original planned date", comparison.plannedDate === "2026-10-07");
assert("actual completion date", comparison.actualDate === "2026-10-09");

const emptyCompare = buildPlannedVsActual({
  plan: { title: "X", plan_date: "2026-10-09", planned_duration_minutes: null },
  session: { session_date: "2026-10-09", duration_minutes: null, intensity: null },
});
assert("no invented comparison rows", emptyCompare.rows.length === 0);

const progress = buildWeeklyTrainingProgress({
  localDate: "2026-10-07",
  target: 3,
  planEntries: [
    { plan_date: "2026-10-05", training_type: "strength", status: "completed", training_session_id: "s1" },
    { plan_date: "2026-10-06", training_type: "rest", status: "planned", training_session_id: null },
    { plan_date: "2026-10-07", training_type: "hiit", status: "skipped", training_session_id: null },
    { plan_date: "2026-10-08", training_type: "cardio", status: "planned", training_session_id: null },
  ],
  sessions: [
    { id: "s1", session_date: "2026-10-05", duration_minutes: 40 },
    { id: "s2", session_date: "2026-10-09", duration_minutes: 20 },
  ],
});
assert("rest excluded from planned", progress.plannedSessions === 3);
assert("rest counted separately", progress.restDays === 1);
assert("completed planned only", progress.completedPlannedSessions === 1);
assert("skipped tracked", progress.skippedSessions === 1);
assert("unplanned separate", progress.unplannedSessions === 1);
assert("fill uses completed planned vs target", progress.fillPercent === 33);

const changes = parsePlanProposalChanges([
  { entry_id: "abc", action: "move", to_date: "2026-10-10" },
  { entryId: "def", action: "skip" },
]);
assert("parses proposal changes", changes.length === 2);
assert("move has toDate", changes[0].toDate === "2026-10-10");

const constraints = [
  {
    id: "c1",
    start_date: "2026-10-08",
    end_date: "2026-10-09",
    active: true,
  },
  {
    id: "c2",
    start_date: "2026-10-01",
    end_date: "2026-10-03",
    active: true,
  },
];
assert(
  "constraint active on travel day",
  activeConstraintsForDate(constraints, "2026-10-08").length === 1,
);
assert(
  "constraint expired after end",
  activeConstraintsForDate(constraints, "2026-10-10").length === 0,
);

const store = {
  plans: [
    {
      id: "p1",
      plan_date: "2026-10-09",
      original_plan_date: null,
      status: "skipped",
    },
  ],
  proposals: [
    {
      id: "pr1",
      status: "pending",
      changes: [{ entryId: "p1", action: "move", toDate: "2026-10-10" }],
    },
  ],
};
const first = acceptProposal(store, "pr1");
const second = acceptProposal(store, "pr1");
assert("accept applies once", first.ok && !first.duplicate);
assert("repeat accept is idempotent", second.ok && second.duplicate);
assert("plan moved", store.plans[0].plan_date === "2026-10-10");
assert("original date retained", store.plans[0].original_plan_date === "2026-10-09");

// Complete without duplicate
function completePlan(state, planId) {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return { created: false };
  if (plan.training_session_id) {
    return { created: false, sessionId: plan.training_session_id };
  }
  const session = { id: `s-${state.sessions.length + 1}` };
  state.sessions.push(session);
  plan.training_session_id = session.id;
  plan.status = "completed";
  return { created: true, sessionId: session.id };
}
const completeState = {
  plans: [{ id: "a", status: "planned", training_session_id: null }],
  sessions: [],
};
const c1 = completePlan(completeState, "a");
const c2 = completePlan(completeState, "a");
assert("first complete creates session", c1.created);
assert("second complete reuses session", !c2.created && c2.sessionId === c1.sessionId);
assert("one session only", completeState.sessions.length === 1);

// Reject leaves plan unchanged
const rejectStore = {
  plans: [{ id: "p2", plan_date: "2026-10-09", status: "planned" }],
  proposals: [
    {
      id: "pr2",
      status: "pending",
      changes: [{ entryId: "p2", action: "move", toDate: "2026-10-11" }],
    },
  ],
};
rejectStore.proposals[0].status = "rejected";
assert(
  "reject leaves plan date",
  rejectStore.plans[0].plan_date === "2026-10-09",
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
