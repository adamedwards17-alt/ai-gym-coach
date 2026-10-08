/**
 * Deterministic Coach Moment resolver for Today.
 * Time + completed state first; AI does not decide basic relevance.
 */

import type { MealTypeId, NutritionDaySummary } from "@/lib/nutrition";
import type { PlanId } from "@/lib/today";

export type DayPhase =
  | "morning"
  | "late_morning"
  | "lunch"
  | "afternoon"
  | "evening"
  | "night";

export type CoachMomentType =
  | "morning_check_in"
  | "breakfast"
  | "lunch"
  | "snack"
  | "dinner"
  | "training"
  | "nutrition_observation"
  | "all_set";

export type CoachMomentKind = "meal_decision" | "action" | "observation";

export type CoachMoment = {
  type: CoachMomentType;
  phase: DayPhase;
  kind: CoachMomentKind;
  /** Primary coach line shown on Today. */
  title: string;
  description: string | null;
  showInspirationCta: boolean;
  priority: number;
};

export type CoachMomentInput = {
  now: Date;
  hasCheckIn: boolean;
  plannedTraining: PlanId | null;
  loggedMealTypes: Array<MealTypeId | null>;
  hasTrainingSession: boolean;
  nutrition: NutritionDaySummary | null;
};

function hourOf(now: Date): number {
  return now.getHours();
}

export function resolveDayPhase(now: Date): DayPhase {
  const hour = hourOf(now);
  if (hour >= 5 && hour < 10) {
    return "morning";
  }
  if (hour >= 10 && hour < 12) {
    return "late_morning";
  }
  if (hour >= 12 && hour < 14) {
    return "lunch";
  }
  if (hour >= 14 && hour < 17) {
    return "afternoon";
  }
  if (hour >= 17 && hour < 21) {
    return "evening";
  }
  return "night";
}

function hasMeal(
  logged: Array<MealTypeId | null>,
  meal: MealTypeId,
): boolean {
  return logged.includes(meal);
}

function mealScore(
  meal: "breakfast" | "lunch" | "snack" | "dinner",
  hour: number,
  logged: Array<MealTypeId | null>,
): number {
  if (hasMeal(logged, meal)) {
    return 0;
  }

  if (meal === "breakfast") {
    if (hour < 11) {
      return 90;
    }
    if (hour < 14) {
      return 55;
    }
    return 0;
  }

  if (meal === "lunch") {
    if (hour < 11) {
      return 15;
    }
    if (hour < 15) {
      return 88;
    }
    if (hour < 17) {
      return 40;
    }
    return 0;
  }

  if (meal === "snack") {
    if (!hasMeal(logged, "lunch") && hour < 14) {
      return 0;
    }
    if (hour >= 14 && hour < 17) {
      return 62;
    }
    if (hour >= 17 && hour < 19) {
      return 35;
    }
    return 0;
  }

  // dinner
  if (hour < 16) {
    return 10;
  }
  if (hour < 18) {
    return 55;
  }
  if (hour < 22) {
    return 90;
  }
  return 50;
}

function mealTitle(
  meal: "breakfast" | "lunch" | "snack" | "dinner",
): string {
  switch (meal) {
    case "breakfast":
      return "What’s on the cards for breakfast?";
    case "lunch":
      return "What’s on the menu for lunch?";
    case "snack":
      return "Had anything since lunch?";
    case "dinner":
      return "What’s the plan for dinner?";
  }
}

function mealDescription(
  meal: "breakfast" | "lunch" | "snack" | "dinner",
): string {
  switch (meal) {
    case "breakfast":
      return "A quick log keeps today’s nutrition honest from the start.";
    case "lunch":
      return "Log lunch when you’re ready — or ask for inspiration.";
    case "snack":
      return "Snacks and drinks count if you’ve had any.";
    case "dinner":
      return "Finish the day with a clear picture of what you ate.";
  }
}

function buildNutritionObservation(
  nutrition: NutritionDaySummary | null,
): CoachMoment | null {
  if (!nutrition || nutrition.targetsStatus !== "ok" || !nutrition.targets) {
    return null;
  }

  const { remaining, consumed, targets } = nutrition;
  const calLeft = remaining.calories;
  const proteinLeft = remaining.proteinG;
  const nearCalories =
    Math.abs(calLeft) <= Math.max(150, targets.daily_calories * 0.08);
  const proteinShort = proteinLeft > 10;
  const proteinOnTrack = proteinLeft <= 10 && proteinLeft >= -15;

  let title: string;
  if (calLeft > 120 && proteinShort) {
    title = `You’ve got around ${calLeft.toLocaleString()} calories left today and you’re still about ${proteinLeft}g short on protein.`;
  } else if (calLeft > 120 && proteinOnTrack) {
    title = `You’ve got around ${calLeft.toLocaleString()} calories left — protein looks on track.`;
  } else if (calLeft < -80) {
    title = `You’re about ${Math.abs(calLeft).toLocaleString()} calories over target. Keep tonight’s choices steady.`;
  } else if (nearCalories && proteinOnTrack) {
    title =
      "You’re close to today’s targets. Nice work — keep the evening simple.";
  } else if (consumed.calories === 0) {
    title = "Nothing logged yet today. When you eat, I’m here for ideas.";
  } else {
    title = `About ${Math.max(0, calLeft).toLocaleString()} kcal and ${Math.max(0, proteinLeft)}g protein left in the day.`;
  }

  return {
    type: "nutrition_observation",
    phase: "evening",
    kind: "observation",
    title,
    description: null,
    showInspirationCta: calLeft > 200 || proteinShort,
    priority: 35,
  };
}

/**
 * Resolve the single most relevant Coach Moment for Today.
 * Never proposes a meal the user has already logged.
 */
export function resolveCoachMoment(input: CoachMomentInput): CoachMoment {
  const hour = hourOf(input.now);
  const phase = resolveDayPhase(input.now);
  const candidates: CoachMoment[] = [];

  if (!input.hasCheckIn && (phase === "morning" || phase === "late_morning")) {
    candidates.push({
      type: "morning_check_in",
      phase,
      kind: "action",
      title:
        phase === "morning"
          ? "How are you feeling this morning?"
          : "Start today’s check-in when you’re ready.",
      description: "A quick recovery check sets up training and food for the day.",
      showInspirationCta: false,
      priority: phase === "morning" ? 100 : 85,
    });
  } else if (!input.hasCheckIn && hour < 17) {
    candidates.push({
      type: "morning_check_in",
      phase,
      kind: "action",
      title: "Start today’s check-in",
      description: "Still useful later in the day if you haven’t done it.",
      showInspirationCta: false,
      priority: 70,
    });
  }

  const meals: Array<"breakfast" | "lunch" | "snack" | "dinner"> = [
    "breakfast",
    "lunch",
    "snack",
    "dinner",
  ];

  for (const meal of meals) {
    const score = mealScore(meal, hour, input.loggedMealTypes);
    if (score <= 0) {
      continue;
    }
    candidates.push({
      type: meal,
      phase,
      kind: "meal_decision",
      title: mealTitle(meal),
      description: mealDescription(meal),
      showInspirationCta: true,
      priority: score,
    });
  }

  const trainingPlanned =
    input.plannedTraining === "strength" ||
    input.plannedTraining === "hiit" ||
    input.plannedTraining === "recovery";

  if (
    input.hasCheckIn &&
    trainingPlanned &&
    !input.hasTrainingSession &&
    hour >= 10 &&
    hour < 20
  ) {
    candidates.push({
      type: "training",
      phase,
      kind: "action",
      title:
        hour < 17
          ? "Training is still on the plan today."
          : "Log today’s session if you trained.",
      description: "Open Train when you’re ready — no pressure to invent a workout.",
      showInspirationCta: false,
      priority: hour >= 14 && hour < 18 ? 58 : 48,
    });
  }

  const observation = buildNutritionObservation(input.nutrition);
  if (observation) {
    candidates.push({
      ...observation,
      phase,
      // Prefer observations once meal questions are no longer relevant.
      priority:
        meals.every((meal) => hasMeal(input.loggedMealTypes, meal))
          ? 95
          : observation.priority,
    });
  }

  if (candidates.length === 0) {
    return {
      type: "all_set",
      phase,
      kind: "observation",
      title: "You’re in a good place for today.",
      description: "Ask Coach anytime if you want a tweak.",
      showInspirationCta: false,
      priority: 0,
    };
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}
