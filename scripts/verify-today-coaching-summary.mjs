/**
 * Deterministic Today coaching summary tests.
 * Run: node scripts/verify-today-coaching-summary.mjs
 *
 * Mirrors src/lib/today-coaching-summary.ts — keep in sync.
 */

function formatAround(n) {
  return Math.round(n).toLocaleString("en-GB");
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

function activeEntries(entries) {
  return entries.filter((e) => e.status !== "rescheduled");
}

function isTrainingType(type) {
  return type !== "rest";
}

function readNutritionFacts(summary) {
  if (!summary || summary.targetsStatus !== "ok" || !summary.targets) {
    return {
      hasTargets: false,
      calorieRemain: null,
      proteinGap: null,
      proteinOnTrack: false,
    };
  }
  const proteinGap = summary.remaining.proteinG;
  const calorieRemain = summary.remaining.calories;
  const proteinOnTrack =
    proteinGap <= 15 &&
    summary.consumed.proteinG >=
      Math.min(summary.targets.protein_g * 0.55, summary.targets.protein_g - 20);
  return { hasTargets: true, calorieRemain, proteinGap, proteinOnTrack };
}

function trainingOpening(entries) {
  const active = activeEntries(entries);
  const training = active.filter((e) => isTrainingType(e.training_type));
  const restOnly =
    training.length === 0 && active.some((e) => e.training_type === "rest");

  if (restOnly) {
    return {
      kind: "rest",
      sentence:
        "Today is a rest day, so focus on recovery and hitting your nutrition targets.",
    };
  }
  if (training.length === 0) return { kind: "none", sentence: null };

  const completed = training.filter((e) => e.status === "completed");
  const planned = training.filter((e) => e.status === "planned");
  const skipped = training.filter((e) => e.status === "skipped");

  if (planned.length === 0 && completed.length === training.length) {
    return {
      kind: "all_done",
      sentence:
        completed.length === 1
          ? "Great work getting your workout done today."
          : "Great work getting your workouts done today.",
    };
  }
  if (planned.length === 0 && skipped.length === training.length) {
    return {
      kind: "all_skipped",
      sentence:
        "No problem skipping today’s session — we can reschedule when you’re ready.",
    };
  }
  if (planned.length === 0 && completed.length > 0 && skipped.length > 0) {
    return {
      kind: "all_done",
      sentence:
        "Nice work on what you completed — leave the skipped session without guilt.",
    };
  }
  if (planned.length > 0 && completed.length > 0) {
    const remaining = planned
      .map((e) => e.title || labelForTrainingType(e.training_type))
      .slice(0, 2)
      .join(" and ");
    return {
      kind: "partial_done",
      sentence: `You’ve completed ${completed.length} session${
        completed.length === 1 ? "" : "s"
      } — ${remaining} still to go.`,
    };
  }
  if (planned.length === 1) {
    return {
      kind: "planned",
      sentence: `You’ve got ${labelForTrainingType(planned[0].training_type)} scheduled today. Don’t forget to mark your workout as complete once you’ve finished.`,
    };
  }
  if (planned.length > 1) {
    return {
      kind: "planned",
      sentence: `You’ve got ${planned.length} sessions planned today. Mark each one complete when you’re done.`,
    };
  }
  return { kind: "none", sentence: null };
}

function buildTodayCoachingSummary(input) {
  const sentences = [];
  const training = trainingOpening(input.planEntries);
  const nutrition = readNutritionFacts(input.nutrition);
  if (training.sentence) sentences.push(training.sentence);

  if (nutrition.hasTargets) {
    const calorieRemain = nutrition.calorieRemain ?? 0;
    const proteinGap = nutrition.proteinGap ?? 0;

    if (training.kind === "all_done") {
      if (calorieRemain > 150 && proteinGap >= 25) {
        sentences.push(
          `You’ve got around ${formatAround(calorieRemain)} calories left and are still about ${formatAround(proteinGap)}g short of your protein target.`,
        );
        sentences.push("Prioritise a protein-rich meal later.");
      } else if (nutrition.proteinOnTrack && calorieRemain >= -150) {
        sentences.push(
          "You’re on track with protein today, so focus on balanced meals for the rest of the day.",
        );
      } else if (proteinGap >= 25) {
        sentences.push(
          `You’re still about ${formatAround(proteinGap)}g short of your protein target — prioritise protein later.`,
        );
      } else if (calorieRemain > 150) {
        sentences.push(
          `You’ve got around ${formatAround(calorieRemain)} calories left.`,
        );
      }
    } else if (training.kind === "rest") {
      if (proteinGap >= 25) {
        sentences.push(
          `You’re still about ${formatAround(proteinGap)}g short of your protein target.`,
        );
      }
    } else if (training.kind === "planned" || training.kind === "partial_done") {
      if (proteinGap >= 25 && calorieRemain > 150) {
        sentences.push(
          `Alongside that, you’ve got around ${formatAround(calorieRemain)} calories left and about ${formatAround(proteinGap)}g of protein still to go.`,
        );
      } else if (proteinGap >= 25) {
        sentences.push(
          `You’re still about ${formatAround(proteinGap)}g short of your protein target.`,
        );
      } else if (calorieRemain > 400) {
        sentences.push(
          `You’ve got around ${formatAround(calorieRemain)} calories left today.`,
        );
      }
    } else if (training.kind === "all_skipped") {
      if (proteinGap >= 25) {
        sentences.push(
          `Keep nutrition simple — you’re still about ${formatAround(proteinGap)}g short of your protein target.`,
        );
      }
    } else if (training.kind === "none") {
      if (calorieRemain > 150 && proteinGap >= 25) {
        sentences.push(
          `You’ve got around ${formatAround(calorieRemain)} calories left and are still about ${formatAround(proteinGap)}g short of your protein target.`,
        );
        sentences.push("Prioritise a protein-rich meal later.");
      } else if (nutrition.proteinOnTrack) {
        sentences.push(
          "You’re on track with protein today — keep meals balanced.",
        );
      } else if (proteinGap >= 25) {
        sentences.push(
          `You’re still about ${formatAround(proteinGap)}g short of your protein target.`,
        );
      } else if (calorieRemain > 150) {
        sentences.push(
          `You’ve got around ${formatAround(calorieRemain)} calories left.`,
        );
      }
    }
  }

  if (sentences.length === 0) {
    sentences.push(
      "Log food and training as you go — I’ll keep this summary up to date.",
    );
  }
  const trimmed = sentences.slice(0, 3);
  return { sentences: trimmed, text: trimmed.join(" ") };
}

function nutritionSummary({ caloriesLeft, proteinLeft, consumedProtein = 50, proteinTarget = 170, calorieTarget = 2400 }) {
  return {
    targetsStatus: "ok",
    targets: { daily_calories: calorieTarget, protein_g: proteinTarget, carbs_g: 250, fat_g: 70 },
    consumed: {
      calories: calorieTarget - caloriesLeft,
      proteinG: consumedProtein,
      carbsG: 100,
      fatG: 40,
    },
    remaining: {
      calories: caloriesLeft,
      proteinG: proteinLeft,
      carbsG: 150,
      fatG: 30,
    },
  };
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

console.log("verify-today-coaching-summary");

const planned = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Intervals", training_type: "hiit", status: "planned", planned_duration_minutes: 30 },
  ],
  nutrition: null,
});
assert("planned not completed mentions HIIT", planned.text.includes("HIIT"));
assert("planned asks to mark complete", planned.text.includes("mark your workout as complete"));
assert("planned does not invent nutrition", !planned.text.includes("calories"));

const doneCalories = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Upper", training_type: "strength", status: "completed", planned_duration_minutes: 45 },
  ],
  nutrition: nutritionSummary({ caloriesLeft: 1900, proteinLeft: 81, consumedProtein: 89 }),
});
assert("completed opener", doneCalories.text.includes("Great work getting your workout done"));
assert("mentions calories left", doneCalories.text.includes("1,900 calories left"));
assert("mentions protein gap", doneCalories.text.includes("81g short"));
assert("suggests protein meal", doneCalories.text.includes("protein-rich"));

const doneOnTrack = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Run", training_type: "cardio", status: "completed", planned_duration_minutes: 40 },
  ],
  nutrition: nutritionSummary({
    caloriesLeft: 800,
    proteinLeft: 10,
    consumedProtein: 160,
    proteinTarget: 170,
  }),
});
assert("on track protein wording", doneOnTrack.text.includes("on track with protein"));

const rest = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Rest day", training_type: "rest", status: "planned", planned_duration_minutes: null },
  ],
  nutrition: null,
});
assert("rest day wording", rest.text.includes("rest day"));
assert("rest does not invent workout", !rest.text.includes("scheduled"));

const skipped = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Upper", training_type: "strength", status: "skipped", planned_duration_minutes: 45 },
  ],
  nutrition: null,
});
assert("skipped acknowledged", skipped.text.includes("skipping"));
assert("skipped does not nag complete", !skipped.text.includes("mark your workout as complete"));

const multi = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Upper", training_type: "strength", status: "completed", planned_duration_minutes: 45 },
    { id: "2", title: "HIIT", training_type: "hiit", status: "planned", planned_duration_minutes: 30 },
  ],
  nutrition: null,
});
assert("partial multi workouts", multi.text.includes("still to go"));
assert("does not claim all done", !multi.text.includes("Great work getting your workouts done"));

const empty = buildTodayCoachingSummary({
  planEntries: [],
  nutrition: null,
});
assert("missing data fallback", empty.text.includes("Log food and training"));

const beforeProtein = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Upper", training_type: "strength", status: "completed", planned_duration_minutes: 45 },
  ],
  nutrition: nutritionSummary({ caloriesLeft: 1900, proteinLeft: 81, consumedProtein: 89 }),
});
const afterProtein = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Upper", training_type: "strength", status: "completed", planned_duration_minutes: 45 },
  ],
  nutrition: nutritionSummary({
    caloriesLeft: 800,
    proteinLeft: 8,
    consumedProtein: 162,
    proteinTarget: 170,
  }),
});
assert(
  "nutrition change updates summary",
  beforeProtein.text.includes("81g short") &&
    afterProtein.text.includes("on track with protein") &&
    beforeProtein.text !== afterProtein.text,
);
assert(
  "on-track path drops large calorie+protein gap claim",
  !afterProtein.text.includes("81g short"),
);

const statusFlip = buildTodayCoachingSummary({
  planEntries: [
    { id: "1", title: "Upper", training_type: "strength", status: "planned", planned_duration_minutes: 45 },
  ],
  nutrition: nutritionSummary({ caloriesLeft: 1900, proteinLeft: 81, consumedProtein: 89 }),
});
assert("status change from planned to done differs", statusFlip.text !== doneCalories.text);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
