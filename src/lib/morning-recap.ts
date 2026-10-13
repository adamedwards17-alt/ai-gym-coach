/**
 * Data-backed morning coaching recap for yesterday → today.
 * Only claims supported by recorded nutrition / training / check-in data.
 */

import type { NutritionDaySummary } from "@/lib/nutrition";
import type { TrainingSessionRecord } from "@/lib/training";
import type { TodayPlanWorkout } from "@/lib/today-coaching-summary";

export type MorningRecapObservation = {
  id: string;
  text: string;
  tone: "neutral" | "encourage" | "attention";
};

export type MorningRecapAction = {
  id: string;
  label: string;
  href: string;
};

export type MorningRecap = {
  yesterdayDate: string;
  observations: MorningRecapObservation[];
  actions: MorningRecapAction[];
  todayPlanLine: string;
  diaryLooksIncomplete: boolean;
};

function percentOfTarget(consumed: number, target: number): number | null {
  if (!Number.isFinite(target) || target <= 0) {
    return null;
  }
  return Math.round((consumed / target) * 100);
}

export function buildMorningRecap(input: {
  todayDate: string;
  yesterdayDate: string;
  yesterdayNutrition: NutritionDaySummary | null;
  yesterdaySessions: TrainingSessionRecord[];
  yesterdayPlanEntries: TodayPlanWorkout[];
  todayPlanEntries: TodayPlanWorkout[];
}): MorningRecap {
  const observations: MorningRecapObservation[] = [];
  const actions: MorningRecapAction[] = [];
  const nutrition = input.yesterdayNutrition;
  const eatenCount = nutrition?.eatenEntries.length ?? 0;
  const diaryLooksIncomplete = eatenCount === 0;

  if (diaryLooksIncomplete) {
    observations.push({
      id: "diary-empty",
      text: "Yesterday’s food diary looks empty. If you ate and forgot to log, you can add it now.",
      tone: "attention",
    });
    actions.push({
      id: "add-yesterday-food",
      label: "Add missing food from yesterday",
      href: `/nutrition?date=${input.yesterdayDate}`,
    });
  } else if (nutrition?.targets) {
    const calPct = percentOfTarget(
      nutrition.consumed.calories,
      nutrition.targets.daily_calories,
    );
    const proteinPct = percentOfTarget(
      nutrition.consumed.proteinG,
      nutrition.targets.protein_g,
    );

    if (calPct != null) {
      if (calPct >= 90 && calPct <= 110) {
        observations.push({
          id: "calories-close",
          text: `You were close to your calorie target yesterday (${nutrition.consumed.calories} of ${nutrition.targets.daily_calories} kcal).`,
          tone: "encourage",
        });
      } else if (calPct < 75) {
        observations.push({
          id: "calories-low",
          text: `Logged calories were below target yesterday (${nutrition.consumed.calories} of ${nutrition.targets.daily_calories} kcal). That may simply mean the diary is incomplete.`,
          tone: "attention",
        });
      } else if (calPct > 120) {
        observations.push({
          id: "calories-high",
          text: `Logged calories were above target yesterday (${nutrition.consumed.calories} of ${nutrition.targets.daily_calories} kcal). One day doesn’t define progress.`,
          tone: "neutral",
        });
      }
    }

    if (proteinPct != null && proteinPct < 80) {
      observations.push({
        id: "protein-low",
        text: `Protein was below target yesterday (${Math.round(nutrition.consumed.proteinG)}g of ${nutrition.targets.protein_g}g). Let’s plan for that today.`,
        tone: "attention",
      });
    }

    actions.push({
      id: "review-yesterday-nutrition",
      label: "Review yesterday’s nutrition",
      href: `/nutrition?date=${input.yesterdayDate}`,
    });
  }

  const plannedYesterday = input.yesterdayPlanEntries.filter(
    (entry) => entry.training_type !== "rest",
  );
  const completedPlan = plannedYesterday.some(
    (entry) => entry.status === "completed",
  );
  const skippedPlan = plannedYesterday.some(
    (entry) => entry.status === "skipped",
  );
  const hasLoggedSession = input.yesterdaySessions.length > 0;

  if (completedPlan || (plannedYesterday.length === 0 && hasLoggedSession)) {
    observations.push({
      id: "training-done",
      text: hasLoggedSession
        ? "You logged training yesterday. Nice work staying consistent."
        : "You completed your planned session yesterday. Nice work.",
      tone: "encourage",
    });
  } else if (skippedPlan) {
    observations.push({
      id: "training-skipped",
      text: "Yesterday’s planned workout was skipped. That’s fine — recovery days happen.",
      tone: "neutral",
    });
    actions.push({
      id: "edit-yesterday-workout",
      label: "Review yesterday’s training",
      href: "/train",
    });
  } else if (plannedYesterday.length > 0 && !completedPlan) {
    observations.push({
      id: "training-open",
      text: "A planned workout from yesterday still looks incomplete in your log.",
      tone: "attention",
    });
    actions.push({
      id: "edit-yesterday-workout",
      label: "Edit yesterday’s workout",
      href: "/train",
    });
  }

  const todayActive = input.todayPlanEntries.filter(
    (entry) => entry.training_type !== "rest",
  );
  const todayRest = input.todayPlanEntries.every(
    (entry) => entry.training_type === "rest",
  );
  let todayPlanLine = "No sessions planned for today yet.";
  if (todayRest && input.todayPlanEntries.length > 0) {
    todayPlanLine = "Today is a rest day — recovery counts.";
  } else if (todayActive.length > 0) {
    todayPlanLine = todayActive
      .map((entry) => `${entry.title} (${entry.training_type})`)
      .join(" · ");
  }

  // Deduplicate actions by id.
  const seen = new Set<string>();
  const uniqueActions = actions.filter((action) => {
    if (seen.has(action.id)) {
      return false;
    }
    seen.add(action.id);
    return true;
  });

  return {
    yesterdayDate: input.yesterdayDate,
    observations: observations.slice(0, 4),
    actions: uniqueActions.slice(0, 4),
    todayPlanLine,
    diaryLooksIncomplete,
  };
}

export function morningRecapStorageKey(localDate: string): string {
  return `ai-gym-coach:morning-recap-dismissed:${localDate}`;
}
