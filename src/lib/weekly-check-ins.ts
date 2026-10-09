/**
 * Weekly check-in domain + recommendation heuristics.
 * Keep scripts/verify-profile-goals-progress.mjs in sync.
 */

import { startOfWeekMonday } from "@/lib/training-week";

export type AdherenceLevel =
  | "almost_entirely"
  | "most_of_the_time"
  | "some_of_the_time"
  | "not_much";

export type RecoveryFeeling =
  | "struggling"
  | "normal"
  | "strong"
  | "didnt_train";

export type WeeklyRecommendationKind =
  | "keep_plan"
  | "adjust_nutrition"
  | "adjust_training"
  | "improve_consistency"
  | "review_goal"
  | "inconclusive";

export type WeeklyCheckInRecord = {
  id: string;
  week_start_date: string;
  status: "in_progress" | "completed";
  weight_kg: number | null;
  weight_confirmed: boolean;
  hunger_rating: number | null;
  energy_rating: number | null;
  mood_rating: number | null;
  nutrition_adherence: AdherenceLevel | null;
  training_adherence: AdherenceLevel | null;
  recovery_feeling: RecoveryFeeling | null;
  context_notes: string | null;
  context_tags: string[];
  coach_summary: string | null;
  recommendation_kind: WeeklyRecommendationKind | null;
  recommendation_text: string | null;
  proposal_status: "none" | "pending" | "accepted" | "rejected" | null;
  proposed_daily_calories: number | null;
  proposed_protein_g: number | null;
  proposed_carbs_g: number | null;
  proposed_fat_g: number | null;
  completed_at: string | null;
  created_at: string;
};

export const adherenceOptions: { id: AdherenceLevel; label: string }[] = [
  { id: "almost_entirely", label: "Almost entirely" },
  { id: "most_of_the_time", label: "Most of the time" },
  { id: "some_of_the_time", label: "Some of the time" },
  { id: "not_much", label: "Not much this week" },
];

export const recoveryOptions: { id: RecoveryFeeling; label: string }[] = [
  { id: "struggling", label: "Struggling to recover" },
  { id: "normal", label: "About normal" },
  { id: "strong", label: "Feeling strong and recovering well" },
  { id: "didnt_train", label: "Didn’t train much this week" },
];

export const ratingLabels = [
  { value: 1, label: "Very low" },
  { value: 2, label: "Low" },
  { value: 3, label: "Okay" },
  { value: 4, label: "High" },
  { value: 5, label: "Very high" },
] as const;

export const contextTagOptions = [
  { id: "travel", label: "Travel" },
  { id: "stress", label: "Stress" },
  { id: "sleep", label: "Poor sleep" },
  { id: "illness", label: "Illness / disruption" },
  { id: "schedule", label: "Schedule changes" },
] as const;

export function weekStartForLocalDate(localDate: string): string {
  return startOfWeekMonday(localDate);
}

export function isWeeklyCheckInDue(input: {
  today: string;
  latestCompletedWeekStart: string | null;
}): boolean {
  const thisWeek = weekStartForLocalDate(input.today);
  if (!input.latestCompletedWeekStart) {
    // Due once we've had a few days of the week — Monday itself is fine.
    return true;
  }
  return input.latestCompletedWeekStart < thisWeek;
}

export type WeeklyRecommendationInput = {
  primaryGoal: string | null;
  daysOnPlan: number;
  weighInCountLast14Days: number;
  weightTrendKg: number | null;
  currentCalories: number | null;
  hunger: number | null;
  energy: number | null;
  nutritionAdherence: AdherenceLevel | null;
  trainingAdherence: AdherenceLevel | null;
  recovery: RecoveryFeeling | null;
};

export type WeeklyRecommendation = {
  kind: WeeklyRecommendationKind;
  text: string;
  /** When set, show a confirmable nutrition proposal. */
  proposedCalories: number | null;
};

function lowAdherence(level: AdherenceLevel | null): boolean {
  return level === "some_of_the_time" || level === "not_much";
}

/**
 * Deterministic recommendation from check-in + objective signals.
 * Prefer keep/inconclusive over inventing aggressive changes.
 */
export function buildWeeklyRecommendation(
  input: WeeklyRecommendationInput,
): WeeklyRecommendation {
  const leanGoal =
    input.primaryGoal === "lean" || input.primaryGoal === "recomp";

  if (
    lowAdherence(input.nutritionAdherence) ||
    lowAdherence(input.trainingAdherence)
  ) {
    return {
      kind: "improve_consistency",
      text: "This week looks patchy on adherence. Before changing calories, simplify the plan — fewer decisions, clearer training days, and logging what you actually eat will tell us more than another cut.",
      proposedCalories: null,
    };
  }

  if (input.recovery === "didnt_train") {
    return {
      kind: "adjust_training",
      text: "Training volume was light this week. Keep nutrition steady and focus on getting planned sessions done before changing targets.",
      proposedCalories: null,
    };
  }

  if (input.weighInCountLast14Days < 2 || input.daysOnPlan < 10) {
    return {
      kind: "inconclusive",
      text: "There isn’t enough consistent weigh-in and plan data yet to justify a target change. Keep logging food, training and weight for another week, then review again.",
      proposedCalories: null,
    };
  }

  const trend = input.weightTrendKg;
  const hungry = (input.hunger ?? 0) >= 4;
  const lowEnergy = (input.energy ?? 5) <= 2;

  if (
    leanGoal &&
    trend != null &&
    trend <= -0.8 &&
    (hungry || lowEnergy) &&
    input.currentCalories != null
  ) {
    const proposed = Math.min(
      Math.round(input.currentCalories + 150),
      input.currentCalories + 250,
    );
    return {
      kind: "adjust_nutrition",
      text: `Weight is dropping quickly and you’re reporting ${
        hungry ? "high hunger" : "low energy"
      }. A slightly higher calorie target may make the plan more sustainable without abandoning your goal.`,
      proposedCalories: proposed,
    };
  }

  if (leanGoal && trend != null && Math.abs(trend) < 0.2) {
    if (input.weighInCountLast14Days < 3) {
      return {
        kind: "inconclusive",
        text: "Weight looks flat, but there aren’t enough weigh-ins to treat this as a reliable trend yet. Keep the plan and gather another week of data.",
        proposedCalories: null,
      };
    }
    if (
      input.nutritionAdherence === "almost_entirely" ||
      input.nutritionAdherence === "most_of_the_time"
    ) {
      if (input.currentCalories != null && input.daysOnPlan >= 21) {
        const proposed = Math.max(
          Math.round(input.currentCalories - 100),
          input.currentCalories - 150,
        );
        return {
          kind: "adjust_nutrition",
          text: "Weight has been largely stable with solid adherence for a few weeks. A modest calorie reduction is reasonable if you still want fat loss — confirm before we apply it.",
          proposedCalories: proposed,
        };
      }
      return {
        kind: "inconclusive",
        text: "Weight is fairly stable. Stay consistent a little longer before cutting calories — short plateaus are common.",
        proposedCalories: null,
      };
    }
  }

  if (input.recovery === "struggling") {
    return {
      kind: "adjust_training",
      text: "Recovery feels hard. Protect sleep and consider slightly reducing training intensity or volume before changing food targets.",
      proposedCalories: null,
    };
  }

  return {
    kind: "keep_plan",
    text: "Things look broadly on track. Keep the current plan for now — consistency usually beats frequent tweaks.",
    proposedCalories: null,
  };
}
