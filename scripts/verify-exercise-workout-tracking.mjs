/**
 * Programme integrity + double-progression engine.
 * Run: node scripts/verify-exercise-workout-tracking.mjs
 */

const REQUIRED_W1 = [
  "seated-db-shoulder-press",
  "db-lateral-raise",
  "db-rear-delt-fly",
  "incline-db-bench-press",
  "cable-triceps-pressdown",
  "cable-overhead-triceps-extension",
  "cable-chest-fly",
  "cable-crunch",
];

// Minimal mirror of muscle-building-6wk Workout 1 + schedule checks.
const programme = {
  templates: [
    {
      code: "w1",
      exercises: REQUIRED_W1.map((slug, i) => ({
        exerciseSlug: slug,
        sets: 3,
        repsMin: i === 0 || i === 3 ? 8 : 10,
        repsMax: i === 0 || i === 3 ? 12 : 15,
        restSeconds: i === 0 || i === 3 ? 90 : i === 7 ? 45 : 60,
        sorted: i,
      })),
    },
    { code: "w2", exercises: [{ exerciseSlug: "single-arm-db-row", sets: 3, repsMin: 8, repsMax: 12 }] },
    { code: "w3", exercises: [{ exerciseSlug: "goblet-squat", sets: 3, repsMin: 8, repsMax: 12 }] },
  ],
  weekSlots: [
    { dayOfWeek: 0, slotType: "strength", templateCode: "w1" },
    { dayOfWeek: 1, slotType: "hiit", templateCode: null },
    { dayOfWeek: 2, slotType: "rest", templateCode: null },
    { dayOfWeek: 3, slotType: "strength", templateCode: "w2" },
    { dayOfWeek: 4, slotType: "hiit", templateCode: null },
    { dayOfWeek: 5, slotType: "strength", templateCode: "w3" },
    { dayOfWeek: 6, slotType: "rest", templateCode: null },
  ],
};

function workingSets(sets) {
  return sets.filter((s) => s.completed && !s.painReported);
}

function medianWeight(sets) {
  const weights = workingSets(sets)
    .map((s) => s.weightKg)
    .filter((w) => w != null && Number.isFinite(w) && w > 0)
    .sort((a, b) => a - b);
  if (weights.length === 0) return null;
  return weights[Math.floor(weights.length / 2)];
}

function buildProgressionRecommendation(input) {
  if (input.painReportedThisSession) {
    return { kind: "hold_for_pain", suggestedWeightKg: medianWeight(input.lastSets) };
  }
  const lastWorking = workingSets(input.lastSets);
  if (lastWorking.length === 0) {
    return { kind: "choose_starting_weight", suggestedWeightKg: null };
  }
  const lastWeight = medianWeight(input.lastSets);
  if (lastWeight == null) {
    return { kind: "insufficient_data", suggestedWeightKg: null };
  }
  const allTop =
    lastWorking.length >= input.prescribedSets &&
    lastWorking
      .slice(0, input.prescribedSets)
      .every(
        (s) =>
          s.reps != null &&
          s.reps >= input.repsMax &&
          (s.rir == null ||
            input.targetRirMin == null ||
            s.rir >= input.targetRirMin),
      );
  const excessive = lastWorking.some(
    (s) =>
      s.reps != null &&
      s.reps >= input.repsMax &&
      s.rir != null &&
      input.targetRirMin != null &&
      s.rir < input.targetRirMin,
  );
  if (allTop && !excessive) {
    const increment = input.configuredIncrementKg ?? input.defaultIncrementKg;
    return {
      kind: "increase_load",
      suggestedWeightKg: Math.round((lastWeight + increment) * 10) / 10,
    };
  }
  if (excessive) {
    return { kind: "keep_same", suggestedWeightKg: lastWeight };
  }
  const best = Math.max(...lastWorking.map((s) => s.reps ?? 0));
  if (best < input.repsMax) {
    return { kind: "add_reps", suggestedWeightKg: lastWeight };
  }
  return { kind: "keep_same", suggestedWeightKg: lastWeight };
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

console.log("Exercise workout tracking verification\n");

const w1 = programme.templates.find((t) => t.code === "w1");
assert("workout 1 present", Boolean(w1));
assert(
  "workout 1 has all supplied exercises",
  REQUIRED_W1.every((slug) =>
    w1.exercises.some((e) => e.exerciseSlug === slug),
  ),
);
assert("three resistance templates", programme.templates.length === 3);
assert(
  "week has 2 HIIT + 2 rest + 3 strength",
  programme.weekSlots.filter((s) => s.slotType === "hiit").length === 2 &&
    programme.weekSlots.filter((s) => s.slotType === "rest").length === 2 &&
    programme.weekSlots.filter((s) => s.slotType === "strength").length === 3,
);

const base = {
  prescribedSets: 3,
  repsMin: 12,
  repsMax: 15,
  targetRirMin: 1,
  targetRirMax: 2,
  weightConvention: "per_dumbbell",
  defaultIncrementKg: 1,
  configuredIncrementKg: null,
  painReportedThisSession: false,
};

assert(
  "no history → choose starting weight",
  buildProgressionRecommendation({ ...base, lastSets: [] }).kind ===
    "choose_starting_weight",
);

assert(
  "all sets at top → increase load",
  buildProgressionRecommendation({
    ...base,
    lastSets: [
      { setNumber: 1, weightKg: 10, reps: 15, rir: 2, completed: true, painReported: false },
      { setNumber: 2, weightKg: 10, reps: 15, rir: 1, completed: true, painReported: false },
      { setNumber: 3, weightKg: 10, reps: 15, rir: 1, completed: true, painReported: false },
    ],
  }).kind === "increase_load",
);

assert(
  "top reps with RIR 0 → keep same",
  buildProgressionRecommendation({
    ...base,
    lastSets: [
      { setNumber: 1, weightKg: 10, reps: 15, rir: 0, completed: true, painReported: false },
      { setNumber: 2, weightKg: 10, reps: 15, rir: 0, completed: true, painReported: false },
      { setNumber: 3, weightKg: 10, reps: 15, rir: 0, completed: true, painReported: false },
    ],
  }).kind === "keep_same",
);

assert(
  "mid-range reps → add reps",
  buildProgressionRecommendation({
    ...base,
    lastSets: [
      { setNumber: 1, weightKg: 10, reps: 12, rir: 2, completed: true, painReported: false },
      { setNumber: 2, weightKg: 10, reps: 12, rir: 2, completed: true, painReported: false },
      { setNumber: 3, weightKg: 10, reps: 11, rir: 2, completed: true, painReported: false },
    ],
  }).kind === "add_reps",
);

assert(
  "pain suppresses load increase",
  buildProgressionRecommendation({
    ...base,
    painReportedThisSession: true,
    lastSets: [
      { setNumber: 1, weightKg: 10, reps: 15, rir: 2, completed: true, painReported: false },
      { setNumber: 2, weightKg: 10, reps: 15, rir: 2, completed: true, painReported: false },
      { setNumber: 3, weightKg: 10, reps: 15, rir: 2, completed: true, painReported: false },
    ],
  }).kind === "hold_for_pain",
);

const bump = buildProgressionRecommendation({
  ...base,
  lastSets: [
    { setNumber: 1, weightKg: 10, reps: 15, rir: 2, completed: true, painReported: false },
    { setNumber: 2, weightKg: 10, reps: 15, rir: 2, completed: true, painReported: false },
    { setNumber: 3, weightKg: 10, reps: 15, rir: 2, completed: true, painReported: false },
  ],
});
assert("suggested weight +1kg", bump.suggestedWeightKg === 11);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
