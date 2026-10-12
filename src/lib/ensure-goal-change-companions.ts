/**
 * After a goal_proposal is created, ensure companion nutrition (and review
 * notes) exist so a goal change cannot silently skip nutrition.
 */

import {
  parseGoalProposalPayload,
  type GoalProposalPayload,
} from "@/lib/coach-change-proposals";
import {
  isReviewableGoalId,
  reviewGoalChange,
  type GoalChangeReview,
} from "@/lib/goal-change-review";
import type { NutritionProfileInput } from "@/lib/nutrition-targets";
import { addDaysIso } from "@/lib/programme-deadline";

export type GoalChangeCompanionInput = {
  currentGoal: string | null;
  proposedGoalPayload: Record<string, unknown>;
  todayIso: string;
  profile: NutritionProfileInput;
  currentTargets: {
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    isManual: boolean;
  } | null;
  phases: Array<{
    name?: string | null;
    kind?: string | null;
    status?: string | null;
    durationWeeks: number;
  }>;
  weightTrendKg?: number | null;
  /** True when the coach already emitted a nutrition_proposal for this turn. */
  nutritionProposalAlreadyPresent: boolean;
};

export type GoalChangeCompanionResult = {
  review: GoalChangeReview | null;
  /** Nutrition proposal payload to create when the coach omitted one. */
  nutritionCompanion: {
    reason: string;
    payload: {
      dailyCalories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      setManual: boolean;
    };
  } | null;
  /** Plain-language lines the coach reply should cover (for logging / UI). */
  keepNutritionNote: string | null;
};

export function buildGoalChangeCompanions(
  input: GoalChangeCompanionInput,
): GoalChangeCompanionResult {
  const parsed = parseGoalProposalPayload(input.proposedGoalPayload);
  if (!parsed?.primaryGoal || !isReviewableGoalId(parsed.primaryGoal)) {
    return {
      review: null,
      nutritionCompanion: null,
      keepNutritionNote: null,
    };
  }

  const proposedTargetDate =
    parsed.targetDate ??
    (parsed.durationWeeks != null
      ? addDaysIso(input.todayIso, parsed.durationWeeks * 7)
      : null);

  const review = reviewGoalChange({
    currentGoal: input.currentGoal,
    proposedGoal: parsed.primaryGoal,
    proposedTargetDate,
    todayIso: input.todayIso,
    profile: {
      ...input.profile,
      primary_goal: parsed.primaryGoal,
    },
    currentTargets: input.currentTargets,
    phases: input.phases,
    weightTrendKg: input.weightTrendKg,
  });

  if (review.nutrition.action === "keep") {
    return {
      review,
      nutritionCompanion: null,
      keepNutritionNote: review.nutrition.reason,
    };
  }

  if (
    review.nutrition.action === "propose" &&
    review.nutrition.proposedTargets &&
    !input.nutritionProposalAlreadyPresent
  ) {
    const t = review.nutrition.proposedTargets;
    return {
      review,
      nutritionCompanion: {
        reason: review.nutrition.reason,
        payload: {
          dailyCalories: t.dailyCalories,
          proteinG: t.proteinG,
          carbsG: t.carbsG,
          fatG: t.fatG,
          setManual: true,
        },
      },
      keepNutritionNote: null,
    };
  }

  return {
    review,
    nutritionCompanion: null,
    keepNutritionNote:
      review.nutrition.action === "incomplete"
        ? review.nutrition.reason
        : null,
  };
}

export function formatGoalChangeReviewForContext(
  review: GoalChangeReview,
  proposed: GoalProposalPayload,
): string {
  const lines = [
    "Coordinated goal-change review (deterministic — trust these findings):",
    ...review.summaryLines.map((line) => `- ${line}`),
    `Nutrition detail: ${review.nutrition.reason}`,
    `Training detail: ${review.training.reason}`,
    "Progress notes:",
    ...review.progress.notes.map((note) => `- ${note}`),
  ];
  if (proposed.primaryGoal) {
    lines.push(
      "When confirming this goal, address nutrition in the same turn: either emit nutrition_proposal or clearly state that current targets can stay.",
    );
  }
  return lines.join("\n");
}
