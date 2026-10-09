/**
 * Tests for daily step targets and progress.
 * Run: node scripts/verify-activity-steps.mjs
 *
 * MIRRORS src/lib/activity-steps.ts — keep in sync.
 */

const DEFAULT_DAILY_STEP_TARGET = 10_000;
const MIN_DAILY_STEP_TARGET = 1_000;
const MAX_DAILY_STEP_TARGET = 100_000;
const MAX_DAILY_STEPS = 200_000;

function clampStepTarget(value) {
  return Math.min(
    MAX_DAILY_STEP_TARGET,
    Math.max(MIN_DAILY_STEP_TARGET, Math.round(value)),
  );
}

function parseStepCount(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n < 0 || n > MAX_DAILY_STEPS) return null;
    return n;
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim().replace(/,/g, ""));
    if (!Number.isFinite(n)) return null;
    return parseStepCount(n);
  }
  return null;
}

function parseStepTarget(raw) {
  const n = parseStepCount(raw);
  if (n == null) return null;
  if (n < MIN_DAILY_STEP_TARGET || n > MAX_DAILY_STEP_TARGET) return null;
  return n;
}

function resolveDailyStepTarget(stored) {
  if (
    typeof stored === "number" &&
    Number.isFinite(stored) &&
    stored >= MIN_DAILY_STEP_TARGET &&
    stored <= MAX_DAILY_STEP_TARGET
  ) {
    return Math.round(stored);
  }
  return DEFAULT_DAILY_STEP_TARGET;
}

function buildStepProgress({ steps, target }) {
  const resolved = resolveDailyStepTarget(target);
  const hasEntry = steps != null;
  const count = hasEntry ? Math.max(0, Math.round(steps)) : null;
  const remaining = count == null ? resolved : Math.max(0, resolved - count);
  const fillPercent =
    count == null || resolved <= 0
      ? 0
      : Math.min(100, Math.round((count / resolved) * 100));
  return {
    steps: count,
    target: resolved,
    remaining,
    fillPercent,
    achieved: count != null && count >= resolved,
    hasEntry,
  };
}

/** Simulate unique (user_id, step_date) upsert — one row per local date. */
function upsertStepsStore(store, userId, stepDate, steps) {
  const key = `${userId}|${stepDate}`;
  store.set(key, { userId, stepDate, steps });
  return store.get(key);
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

console.log("verify-activity-steps");

assert("default target is 10,000", resolveDailyStepTarget(null) === 10_000);
assert("default for undefined", resolveDailyStepTarget(undefined) === 10_000);
assert("persisted target is used", resolveDailyStepTarget(8000) === 8000);
assert("invalid low stored falls back", resolveDailyStepTarget(500) === 10_000);
assert("invalid high stored falls back", resolveDailyStepTarget(200_000) === 10_000);

assert("parse valid steps", parseStepCount(7500) === 7500);
assert("parse comma string", parseStepCount("12,500") === 12_500);
assert("reject negative steps", parseStepCount(-1) === null);
assert("reject over max steps", parseStepCount(200_001) === null);
assert("reject non-number", parseStepCount("abc") === null);
assert("accept zero steps", parseStepCount(0) === 0);

assert("parse valid target", parseStepTarget(12_000) === 12_000);
assert("reject target below min", parseStepTarget(500) === null);
assert("clamp target helper", clampStepTarget(50) === 1000);

const empty = buildStepProgress({ steps: null, target: 10_000 });
assert("empty state has no entry", empty.hasEntry === false);
assert("empty remaining is full target", empty.remaining === 10_000);
assert("empty fill is 0", empty.fillPercent === 0);
assert("empty not achieved", empty.achieved === false);

const mid = buildStepProgress({ steps: 5000, target: 10_000 });
assert("mid remaining", mid.remaining === 5000);
assert("mid fill ~50%", mid.fillPercent === 50);
assert("mid not achieved", mid.achieved === false);

const done = buildStepProgress({ steps: 10_000, target: 10_000 });
assert("achieved at target", done.achieved === true);
assert("achieved remaining 0", done.remaining === 0);

const over = buildStepProgress({ steps: 12_000, target: 10_000 });
assert("over target still achieved", over.achieved === true);
assert("over fill capped 100", over.fillPercent === 100);

// Local date handling: en-CA style YYYY-MM-DD keys, not UTC toISOString.
const localDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date(2026, 9, 9, 23, 30)); // Oct 9 local evening
assert("local date format YYYY-MM-DD", /^\d{4}-\d{2}-\d{2}$/.test(localDate));
assert("local date is Oct 9 not UTC-shifted", localDate === "2026-10-09");

const store = new Map();
upsertStepsStore(store, "u1", "2026-10-09", 3000);
upsertStepsStore(store, "u1", "2026-10-09", 4500);
assert("no duplicate day rows", store.size === 1);
assert("same-day update replaces count", store.get("u1|2026-10-09").steps === 4500);
upsertStepsStore(store, "u1", "2026-10-10", 1000);
assert("different day is separate row", store.size === 2);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
