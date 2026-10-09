/**
 * Deterministic Today coaching summary: planned workouts + live nutrition.
 * Prefer 2–3 concise sentences. Never invent missing data.
 *
 * Keep scripts/verify-today-coaching-summary.mjs in sync.
 */

import type { NutritionDaySummary } from "@/lib/nutrition";
import type {
  PlanEntryStatus,
  PlanTrainingTypeId,
} from "@/lib/training";
import { labelForTrainingType } from "@/lib/training";

export type TodayPlanWorkout = {
  id: string;
  title: string;
  training_type: PlanTrainingTypeId;
  status: PlanEntryStatus;
  planned_duration_minutes: number | null;
};

export type TodayCoachingSummaryInput = {
  planEntries: TodayPlanWorkout[];
  nutrition: NutritionDaySummary | null;
  feeling?: string | null;
  /**
   * When a training action banner already prompts completion, keep Coach's Take
   * focused on nutrition context instead of repeating the same reminder.
   */
  suppressTrainingReminder?: boolean;
};

export type TodayCoachingSummary = {
  sentences: string[];
  text: string;
};

function isTrainingType(type: PlanTrainingTypeId): boolean {
  return type !== "rest";
}

function activeEntries(entries: TodayPlanWorkout[]): TodayPlanWorkout[] {
  return entries.filter((entry) => entry.status !== "rescheduled");
}

function formatAround(n: number): string {
  return Math.round(n).toLocaleString("en-GB");
}

type NutritionFacts = {
  hasTargets: boolean;
  calorieRemain: number | null;
  proteinGap: number | null;
  proteinOnTrack: boolean;
};

function readNutritionFacts(
  summary: NutritionDaySummary | null,
): NutritionFacts {
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

  return {
    hasTargets: true,
    calorieRemain,
    proteinGap,
    proteinOnTrack,
  };
}

function trainingOpening(entries: TodayPlanWorkout[]): {
  kind:
    | "rest"
    | "none"
    | "all_done"
    | "all_skipped"
    | "partial_done"
    | "planned"
    | "mixed_skip_planned";
  sentence: string | null;
} {
  const active = activeEntries(entries);
  const training = active.filter((entry) => isTrainingType(entry.training_type));
  const restOnly =
    training.length === 0 &&
    active.some((entry) => entry.training_type === "rest");

  if (restOnly) {
    return {
      kind: "rest",
      sentence:
        "Today is a rest day, so focus on recovery and hitting your nutrition targets.",
    };
  }

  if (training.length === 0) {
    return { kind: "none", sentence: null };
  }

  const completed = training.filter((entry) => entry.status === "completed");
  const planned = training.filter((entry) => entry.status === "planned");
  const skipped = training.filter((entry) => entry.status === "skipped");

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
      .map((entry) => entry.title || labelForTrainingType(entry.training_type))
      .slice(0, 2)
      .join(" and ");
    return {
      kind: "partial_done",
      sentence: `You’ve completed ${completed.length} session${
        completed.length === 1 ? "" : "s"
      } — ${remaining} still to go.`,
    };
  }

  if (planned.length > 0 && skipped.length > 0 && completed.length === 0) {
    const entry = planned[0];
    return {
      kind: "mixed_skip_planned",
      sentence: `You’ve still got ${labelForTrainingType(entry.training_type)} planned — mark it complete when you’re done.`,
    };
  }

  if (planned.length === 1) {
    const entry = planned[0];
    const typeLabel = labelForTrainingType(entry.training_type);
    return {
      kind: "planned",
      sentence: `You’ve got ${typeLabel} scheduled today. Don’t forget to mark your workout as complete once you’ve finished.`,
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

/**
 * Build a short coaching summary from live plan + nutrition records.
 */
export function buildTodayCoachingSummary(
  input: TodayCoachingSummaryInput,
): TodayCoachingSummary {
  const sentences: string[] = [];
  const training = trainingOpening(input.planEntries);
  const nutrition = readNutritionFacts(input.nutrition);

  const suppressReminder =
    input.suppressTrainingReminder === true &&
    (training.kind === "planned" ||
      training.kind === "partial_done" ||
      training.kind === "mixed_skip_planned");

  if (training.sentence && !suppressReminder) {
    sentences.push(training.sentence);
  } else if (suppressReminder && training.kind === "partial_done") {
    // Still acknowledge partial progress without repeating the CTA.
    sentences.push("Nice progress on today’s training.");
  }

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
      // Rest sentence already covers recovery + nutrition targets; add only a sharp gap.
      if (proteinGap >= 25) {
        sentences.push(
          `You’re still about ${formatAround(proteinGap)}g short of your protein target.`,
        );
      }
    } else if (
      training.kind === "planned" ||
      training.kind === "partial_done" ||
      training.kind === "mixed_skip_planned"
    ) {
      if (proteinGap >= 25 && calorieRemain > 150) {
        sentences.push(
          suppressReminder
            ? `Protein is behind target — you’ve got around ${formatAround(calorieRemain)} calories left and about ${formatAround(proteinGap)}g of protein still to go.`
            : `Alongside that, you’ve got around ${formatAround(calorieRemain)} calories left and about ${formatAround(proteinGap)}g of protein still to go.`,
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
    if (input.feeling === "sore") {
      sentences.push(
        "Respect how your body feels today and keep movement sensible.",
      );
    } else if (input.feeling === "tired") {
      sentences.push(
        "Energy looks limited — keep today realistic and focus on food and recovery.",
      );
    } else {
      sentences.push(
        "Log food and training as you go — I’ll keep this summary up to date.",
      );
    }
  }

  const trimmed = sentences.slice(0, 3);
  return {
    sentences: trimmed,
    text: trimmed.join(" "),
  };
}

/** Map plan entries to the coarse PlanId used by older Today helpers. */
export function primaryPlanIdFromEntries(
  entries: TodayPlanWorkout[],
): "strength" | "hiit" | "recovery" | "rest" | "unsure" | null {
  const active = activeEntries(entries);
  const training = active.filter((entry) => isTrainingType(entry.training_type));
  const planned = training.find((entry) => entry.status === "planned");
  const focus = planned ?? training[0];
  if (focus) {
    if (
      focus.training_type === "strength" ||
      focus.training_type === "hiit" ||
      focus.training_type === "recovery"
    ) {
      return focus.training_type;
    }
    return "unsure";
  }
  if (active.some((entry) => entry.training_type === "rest")) {
    return "rest";
  }
  return null;
}

export function hasIncompletePlannedTraining(
  entries: TodayPlanWorkout[],
): boolean {
  return activeEntries(entries).some(
    (entry) =>
      isTrainingType(entry.training_type) && entry.status === "planned",
  );
}

export function hasCompletedPlannedTraining(
  entries: TodayPlanWorkout[],
): boolean {
  return activeEntries(entries).some(
    (entry) =>
      isTrainingType(entry.training_type) && entry.status === "completed",
  );
}
