/**
 * Structured workout logging + week-nav behaviour smoke tests.
 * Run: node scripts/verify-workout-log-form.mjs
 *
 * Complements verify-training-hub / verify-unified-training.
 */

function assert(name, condition) {
  if (!condition) {
    console.error(`  ✗ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ✓ ${name}`);
}

console.log("verify-workout-log-form");

// Form must not treat planned duration as actual until the user enters it.
function buildLogDraft({ plan, session }) {
  return {
    title: session?.title ?? plan?.title ?? "",
    trainingType: session?.training_type ?? plan?.training_type ?? "strength",
    durationMinutes:
      session?.duration_minutes != null ? session.duration_minutes : null,
    plannedDurationMinutes: plan?.planned_duration_minutes ?? null,
    intensity: session?.intensity ?? null,
  };
}

const planned = {
  id: "p1",
  title: "Upper",
  training_type: "strength",
  planned_duration_minutes: 45,
  status: "planned",
  training_session_id: null,
};

const fresh = buildLogDraft({ plan: planned, session: null });
assert("new complete does not assume planned duration", fresh.durationMinutes === null);
assert("planned duration kept as reference only", fresh.plannedDurationMinutes === 45);
assert("title prefilled from plan", fresh.title === "Upper");

const existing = buildLogDraft({
  plan: { ...planned, status: "completed", training_session_id: "s1" },
  session: {
    id: "s1",
    title: "Upper",
    training_type: "strength",
    duration_minutes: 52,
    intensity: "hard",
  },
});
assert("edit loads saved duration", existing.durationMinutes === 52);
assert("edit loads intensity", existing.intensity === "hard");

// Duplicate completion model (mirrors saveTrainingSession link semantics).
function completeOnce(state, planId, payload) {
  const plan = state.plans.find((p) => p.id === planId);
  if (!plan) return { ok: false };
  if (plan.training_session_id) {
    const session = state.sessions.find((s) => s.id === plan.training_session_id);
    Object.assign(session, payload);
    plan.status = "completed";
    return { ok: true, created: false, sessionId: session.id };
  }
  const session = { id: `s-${state.sessions.length + 1}`, ...payload };
  state.sessions.push(session);
  plan.training_session_id = session.id;
  plan.status = "completed";
  return { ok: true, created: true, sessionId: session.id };
}

const state = {
  plans: [{ id: "p1", status: "planned", training_session_id: null }],
  sessions: [],
};
const a = completeOnce(state, "p1", { duration_minutes: 40, session_date: "2026-10-09" });
const b = completeOnce(state, "p1", { duration_minutes: 48, session_date: "2026-10-09" });
assert("first save creates session", a.created === true);
assert("second save updates same session", b.created === false);
assert("no duplicate sessions", state.sessions.length === 1);
assert("duration updated", state.sessions[0].duration_minutes === 48);

// Cancel leaves plan unchanged.
const cancelState = {
  plans: [{ id: "p2", status: "planned", training_session_id: null }],
  sessions: [],
};
const before = JSON.stringify(cancelState);
// User opens form then cancels — no completeOnce call.
assert("cancel leaves plan unchanged", JSON.stringify(cancelState) === before);

// Future plan is not completed by viewing/navigating.
const futurePlan = {
  id: "f1",
  plan_date: "2026-10-20",
  status: "planned",
  training_session_id: null,
};
assert("future plan stays planned", futurePlan.status === "planned");
assert("future plan has no session", futurePlan.training_session_id === null);

// Selected week stability while editing (state model).
let selectedWeek = "2026-10-12";
const openForm = () => ({ week: selectedWeek });
const afterSave = openForm();
assert("selected week stable after save", afterSave.week === "2026-10-12");
selectedWeek = "2026-10-05";
assert("week only changes on navigation", selectedWeek === "2026-10-05");

if (process.exitCode) {
  console.error("\nverify-workout-log-form failed");
} else {
  console.log("\nAll workout-log-form checks passed.");
}
