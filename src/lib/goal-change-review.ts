/**
 * Deterministic coordinated review when a coaching goal changes.
 * Training, nutrition and progress implications are assessed together.
 * Gemini must not invent these numbers — use calculateNutritionTargets.
 */

import { activityLevelLabel } from "@/lib/activity-pattern";
import {
  calculateNutritionTargets,
  type NutritionProfileInput,
  type NutritionTargetsValues,
} from "@/lib/nutrition-targets";
import {
  checkProgrammeFitsDeadline,
  totalPhaseWeeks,
} from "@/lib/programme-deadline";

export type CurrentNutritionTargets = {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isManual: boolean;
};

export type GoalChangeReviewPhase = {
  name?: string | null;
  kind?: string | null;
  status?: string | null;
  durationWeeks: number;
};

export type GoalChangeReviewInput = {
  currentGoal: string | null;
  proposedGoal: string;
  proposedTargetDate: string | null;
  todayIso: string;
  profile: NutritionProfileInput;
  currentTargets: CurrentNutritionTargets | null;
  phases: GoalChangeReviewPhase[];
  weightTrendKg?: number | null;
};

export type NutritionReviewAction = "propose" | "keep" | "incomplete";

export type TrainingReviewAction =
  | "fits"
  | "overflow"
  | "no_programme"
  | "no_deadline";

export type GoalChangeReview = {
  nutrition: {
    action: NutritionReviewAction;
    reason: string;
    proposedTargets: NutritionTargetsValues | null;
    calorieDelta: number | null;
    currentIsManual: boolean;
  };
  training: {
    action: TrainingReviewAction;
    reason: string;
    weeksAvailable: number | null;
    weeksRequired: number | null;
  };
  progress: {
    notes: string[];
  };
  /** Short bullets for coach context / confirmation UI. */
  summaryLines: string[];
};

const MEANINGFUL_CALORIE_DELTA = 75;
const MEANINGFUL_PROTEIN_DELTA = 10;

function goalLabel(goal: string | null | undefined): string {
  if (!goal) {
    return "current goal";
  }
  if (goal === "recomp") {
    return "recomp (build muscle while reducing body fat)";
  }
  if (goal === "lean") {
    return "fat loss";
  }
  if (goal === "muscle") {
    return "muscle building";
  }
  if (goal === "maintain") {
    return "maintenance";
  }
  if (goal === "fitness") {
    return "general fitness";
  }
  return goal;
}

/**
 * Review whether nutrition and training still fit a proposed goal.
 * Does not apply changes — callers create typed proposals for confirmation.
 */
export function reviewGoalChange(
  input: GoalChangeReviewInput,
): GoalChangeReview {
  const profileForProposed: NutritionProfileInput = {
    ...input.profile,
    primary_goal: input.proposedGoal,
  };

  const calculated = calculateNutritionTargets(profileForProposed);
  const currentIsManual = input.currentTargets?.isManual === true;

  let nutrition: GoalChangeReview["nutrition"];
  if (calculated.status === "incomplete" || calculated.status === "review") {
    nutrition = {
      action: "incomplete",
      reason:
        calculated.status === "incomplete"
          ? calculated.message
          : calculated.message,
      proposedTargets: null,
      calorieDelta: null,
      currentIsManual,
    };
  } else {
    const proposed = calculated.targets;
    if (!input.currentTargets) {
      nutrition = {
        action: "propose",
        reason: `No nutrition targets are saved yet. For ${goalLabel(
          input.proposedGoal,
        )}, estimated targets are about ${proposed.dailyCalories} kcal with ${proposed.proteinG}g protein.`,
        proposedTargets: proposed,
        calorieDelta: null,
        currentIsManual,
      };
    } else {
      const calorieDelta =
        proposed.dailyCalories - input.currentTargets.dailyCalories;
      const proteinDelta = proposed.proteinG - input.currentTargets.proteinG;
      const meaningful =
        Math.abs(calorieDelta) >= MEANINGFUL_CALORIE_DELTA ||
        Math.abs(proteinDelta) >= MEANINGFUL_PROTEIN_DELTA;

      if (!meaningful) {
        nutrition = {
          action: "keep",
          reason: `Current targets (${input.currentTargets.dailyCalories} kcal, ${input.currentTargets.proteinG}g protein) already sit close to the estimate for ${goalLabel(
            input.proposedGoal,
          )} (~${proposed.dailyCalories} kcal). No nutrition change is needed unless you want to fine-tune.`,
          proposedTargets: proposed,
          calorieDelta,
          currentIsManual,
        };
      } else {
        const manualNote = currentIsManual
          ? " These are currently manual/coach-confirmed targets — they will stay as they are until you confirm a change."
          : "";
        const trendNote =
          input.weightTrendKg != null && Math.abs(input.weightTrendKg) >= 0.3
            ? ` Recent weight trend is about ${
                input.weightTrendKg > 0 ? "+" : ""
              }${input.weightTrendKg.toFixed(1)} kg over ~7 days.`
            : "";
        const activity = activityLevelLabel(input.profile.activity_level);
        nutrition = {
          action: "propose",
          reason: `For ${goalLabel(
            input.proposedGoal,
          )}, estimated targets shift to about ${proposed.dailyCalories} kcal (${
            calorieDelta > 0 ? "+" : ""
          }${calorieDelta} vs current ${input.currentTargets.dailyCalories}) with ${proposed.proteinG}g protein / ${proposed.carbsG}g carbs / ${proposed.fatG}g fat.${
            activity ? ` Based on activity level “${activity}”.` : ""
          }${trendNote}${manualNote}`,
          proposedTargets: proposed,
          calorieDelta,
          currentIsManual,
        };
      }
    }
  }

  const activePhases = input.phases.filter((p) => p.status !== "completed");
  const fit = checkProgrammeFitsDeadline({
    todayIso: input.todayIso,
    targetDateIso: input.proposedTargetDate,
    phases: activePhases.map((phase) => ({
      durationWeeks: phase.durationWeeks,
      status: phase.status ?? undefined,
    })),
  });

  let training: GoalChangeReview["training"];
  if (activePhases.length === 0) {
    training = {
      action: "no_programme",
      reason:
        "No active programme phases are saved. Confirm whether training structure should be set up for this goal.",
      weeksAvailable: null,
      weeksRequired: null,
    };
  } else if (fit.status === "no_deadline") {
    training = {
      action: "no_deadline",
      reason: `Current phases total about ${fit.weeksRequired} weeks. No target date is set, so deadline fit cannot be checked.`,
      weeksAvailable: null,
      weeksRequired: fit.weeksRequired,
    };
  } else if (fit.status === "fits") {
    training = {
      action: "fits",
      reason: `Current phases (${fit.weeksRequired} weeks) fit the ${fit.weeksAvailable} weeks available until the target date.`,
      weeksAvailable: fit.weeksAvailable,
      weeksRequired: fit.weeksRequired,
    };
  } else {
    training = {
      action: "overflow",
      reason: `Current phases need about ${fit.weeksRequired} weeks but only ${fit.weeksAvailable} weeks remain until the target date (${fit.shortfallWeeks} weeks short). Shorten or reshape the programme.`,
      weeksAvailable: fit.weeksAvailable,
      weeksRequired: fit.weeksRequired,
    };
  }

  const progressNotes: string[] = [
    `Agreed direction: ${goalLabel(input.proposedGoal)}.`,
    "Use weekly weight trend, training adherence and how you feel in weekly check-ins to judge progress — scale weight alone can move slowly during recomp.",
    "Plan a review around the midpoint of the agreed period, or sooner if energy, hunger or training quality drifts.",
  ];
  if (input.currentGoal && input.currentGoal !== input.proposedGoal) {
    progressNotes.unshift(
      `Moving from ${goalLabel(input.currentGoal)} to ${goalLabel(
        input.proposedGoal,
      )}.`,
    );
  }

  const summaryLines: string[] = [
    `Goal: ${goalLabel(input.proposedGoal)}`,
    `Nutrition: ${
      nutrition.action === "propose"
        ? "propose updated targets"
        : nutrition.action === "keep"
          ? "keep current targets"
          : "needs more profile data"
    }`,
    `Training: ${
      training.action === "fits"
        ? "phases fit the deadline"
        : training.action === "overflow"
          ? "phases overrun the deadline"
          : training.action === "no_programme"
            ? "no programme phases yet"
            : "no target date to check against"
    }`,
  ];
  if (activePhases.length > 0) {
    summaryLines.push(
      `Phase stack: ${totalPhaseWeeks(activePhases)} weeks across ${activePhases.length} phase(s)`,
    );
  }

  return {
    nutrition,
    training,
    progress: { notes: progressNotes },
    summaryLines,
  };
}

/** True when a goal id is one the nutrition calculator understands. */
export function isReviewableGoalId(value: string): boolean {
  return (
    value === "lean" ||
    value === "muscle" ||
    value === "recomp" ||
    value === "maintain" ||
    value === "fitness" ||
    value === "other"
  );
}
