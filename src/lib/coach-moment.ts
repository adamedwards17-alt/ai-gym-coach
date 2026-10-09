/**
 * Deterministic Coach Moment resolver for Today.
 * Time + completed state first; AI does not decide basic relevance.
 *
 * Time windows use the device's local clock (UK users: UK local time):
 *   06:00–10:59  morning       (breakfast)
 *   11:00–11:59  late_morning  (mid-morning snack)
 *   12:00–14:29  lunch
 *   14:30–17:29  afternoon     (late lunch nudge, snack, dinner planning)
 *   17:30–20:59  evening       (dinner)
 *   21:00–05:59  night         (recap / observation, never an outdated meal)
 *
 * Keep scripts/verify-coach-moment.mjs in sync with this file.
 */

import { habitPromptTitle, type DetectedHabit } from "@/lib/food-habits";
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
  | "habit"
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
  /** Habit prompts only. */
  habitKey?: string;
  habitDescription?: string;
  habitLabel?: string;
  mealType?: MealTypeId | null;
};

export type CoachMomentInput = {
  now: Date;
  hasCheckIn: boolean;
  plannedTraining: PlanId | null;
  loggedMealTypes: Array<MealTypeId | null>;
  hasTrainingSession: boolean;
  nutrition: NutritionDaySummary | null;
  /** Recurring foods already filtered for stopped / prompted / logged-today. */
  detectedHabits?: DetectedHabit[];
};

/** Minutes since local midnight. */
function minutesOf(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

const MORNING_START = 6 * 60; // 06:00
const LATE_MORNING_START = 11 * 60; // 11:00
const LUNCH_START = 12 * 60; // 12:00
const AFTERNOON_START = 14 * 60 + 30; // 14:30
const EVENING_START = 17 * 60 + 30; // 17:30
const NIGHT_START = 21 * 60; // 21:00
const DINNER_PLANNING_START = 16 * 60; // 16:00

export function resolveDayPhase(now: Date): DayPhase {
  const minutes = minutesOf(now);
  if (minutes >= MORNING_START && minutes < LATE_MORNING_START) {
    return "morning";
  }
  if (minutes >= LATE_MORNING_START && minutes < LUNCH_START) {
    return "late_morning";
  }
  if (minutes >= LUNCH_START && minutes < AFTERNOON_START) {
    return "lunch";
  }
  if (minutes >= AFTERNOON_START && minutes < EVENING_START) {
    return "afternoon";
  }
  if (minutes >= EVENING_START && minutes < NIGHT_START) {
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

type PromptMeal = "breakfast" | "lunch" | "snack" | "dinner";

function mealScore(
  meal: PromptMeal,
  minutes: number,
  logged: Array<MealTypeId | null>,
): number {
  // Never re-ask a meal that's already been logged.
  if (hasMeal(logged, meal)) {
    return 0;
  }

  if (meal === "breakfast") {
    if (minutes < MORNING_START) {
      return 0;
    }
    if (minutes < LATE_MORNING_START) {
      return 90;
    }
    // Later in the day: only a gentle nudge, and not once lunch/dinner exist.
    if (
      minutes < LUNCH_START &&
      !hasMeal(logged, "lunch") &&
      !hasMeal(logged, "dinner")
    ) {
      return 50;
    }
    return 0;
  }

  if (meal === "lunch") {
    if (minutes < LUNCH_START) {
      return 0;
    }
    if (minutes < AFTERNOON_START) {
      return 88;
    }
    // Late lunch: gentler reminder, fades by 16:00.
    if (minutes < DINNER_PLANNING_START) {
      return 45;
    }
    return 0;
  }

  if (meal === "snack") {
    if (minutes >= LATE_MORNING_START && minutes < LUNCH_START) {
      // Mid-morning snack check only once breakfast is out of the way.
      return hasMeal(logged, "breakfast") ? 60 : 0;
    }
    if (minutes >= AFTERNOON_START && minutes < EVENING_START) {
      return hasMeal(logged, "lunch") ? 62 : 30;
    }
    if (minutes >= EVENING_START && minutes < EVENING_START + 60) {
      return 30;
    }
    return 0;
  }

  // dinner
  if (minutes < DINNER_PLANNING_START) {
    return 0;
  }
  if (minutes < EVENING_START) {
    return 45;
  }
  if (minutes < NIGHT_START) {
    return 90;
  }
  // Night: a recap beats an outdated meal question.
  return 0;
}

function mealTitle(meal: PromptMeal, minutes: number): string {
  switch (meal) {
    case "breakfast":
      return minutes < LATE_MORNING_START
        ? "What’s on the cards for breakfast?"
        : "Did you get breakfast in today?";
    case "lunch":
      return minutes < AFTERNOON_START
        ? "What’s on the menu for lunch?"
        : "Did you manage lunch today?";
    case "snack":
      return minutes < LUNCH_START
        ? "Had anything mid-morning?"
        : "Had anything since lunch?";
    case "dinner":
      return "What’s the plan for dinner?";
  }
}

function mealDescription(meal: PromptMeal, minutes: number): string {
  switch (meal) {
    case "breakfast":
      return minutes < LATE_MORNING_START
        ? "A quick log keeps today’s nutrition honest from the start."
        : "Log it if you did — no pressure if you skipped.";
    case "lunch":
      return minutes < AFTERNOON_START
        ? "Log lunch when you’re ready — or ask for inspiration."
        : "No pressure — log it if you did, or ignore this if you skipped it.";
    case "snack":
      return "Snacks and drinks count if you’ve had any.";
    case "dinner":
      return "Finish the day with a clear picture of what you ate.";
  }
}

function buildNutritionObservation(
  nutrition: NutritionDaySummary | null,
  phase: DayPhase,
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
  if (phase === "night") {
    // Night is a recap, not a meal question.
    if (consumed.calories === 0) {
      title = "Nothing logged today. Add what you ate if you’d like a recap.";
    } else if (calLeft < -80) {
      title = `Today’s recap: about ${Math.abs(calLeft).toLocaleString()} kcal over target. No stress — tomorrow is a fresh start.`;
    } else if (proteinShort) {
      title = `Today’s recap: ${consumed.calories.toLocaleString()} kcal logged, finishing about ${proteinLeft}g short on protein.`;
    } else if (nearCalories && proteinOnTrack) {
      title = "Today’s recap: calories and protein landed close to target. Nice work.";
    } else {
      title = `Today’s recap: ${consumed.calories.toLocaleString()} kcal and ${consumed.proteinG}g protein logged.`;
    }
  } else if (calLeft > 120 && proteinShort) {
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
    phase,
    kind: "observation",
    title,
    description: null,
    showInspirationCta: phase !== "night" && (calLeft > 200 || proteinShort),
    priority: 35,
  };
}

/** Meal types whose logging means a habit for that slot is already handled. */
const HABIT_SLOT_MEALS: ReadonlySet<MealTypeId> = new Set([
  "breakfast",
  "lunch",
  "dinner",
  "drink",
]);

function pickHabit(
  habits: DetectedHabit[] | undefined,
  logged: Array<MealTypeId | null>,
): DetectedHabit | null {
  for (const habit of habits ?? []) {
    if (habit.negligibleCalories) {
      continue;
    }
    if (
      habit.mealType &&
      HABIT_SLOT_MEALS.has(habit.mealType) &&
      hasMeal(logged, habit.mealType)
    ) {
      continue;
    }
    return habit;
  }
  return null;
}

/**
 * Collect ranked Coach Moment candidates for Today.
 * Shared by the single-moment resolver and action banners.
 * Never proposes a meal the user has already logged.
 */
export function collectCoachMomentCandidates(
  input: CoachMomentInput,
): CoachMoment[] {
  const hour = input.now.getHours();
  const minutes = minutesOf(input.now);
  const phase = resolveDayPhase(input.now);
  const candidates: CoachMoment[] = [];

  let checkInPriority: number | null = null;

  if (!input.hasCheckIn && (phase === "morning" || phase === "late_morning")) {
    checkInPriority = phase === "morning" ? 100 : 85;
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
      priority: checkInPriority,
    });
  } else if (!input.hasCheckIn && hour >= 6 && hour < 17) {
    checkInPriority = 70;
    candidates.push({
      type: "morning_check_in",
      phase,
      kind: "action",
      title: "Start today’s check-in",
      description: "Still useful later in the day if you haven’t done it.",
      showInspirationCta: false,
      priority: checkInPriority,
    });
  }

  const meals: PromptMeal[] = ["breakfast", "lunch", "snack", "dinner"];

  for (const meal of meals) {
    const score = mealScore(meal, minutes, input.loggedMealTypes);
    if (score <= 0) {
      continue;
    }
    candidates.push({
      type: meal,
      phase,
      kind: "meal_decision",
      title: mealTitle(meal, minutes),
      description: mealDescription(meal, minutes),
      showInspirationCta: true,
      priority: score,
    });
  }

  // Habit prompt: above generic meal/snack questions, below the check-in.
  const habit = pickHabit(input.detectedHabits, input.loggedMealTypes);
  if (habit && phase !== "night" && minutes >= MORNING_START) {
    const priority =
      checkInPriority != null && checkInPriority >= 85
        ? Math.min(91, checkInPriority - 1)
        : 91;
    candidates.push({
      type: "habit",
      phase,
      kind: "action",
      title: habitPromptTitle(habit),
      description: "Tap to log it, or tell me if you’ve stopped having it.",
      showInspirationCta: false,
      priority,
      habitKey: habit.key,
      habitDescription: habit.description,
      habitLabel: habit.label,
      mealType: habit.mealType,
    });
  }

  const trainingPlanned =
    input.plannedTraining === "strength" ||
    input.plannedTraining === "hiit" ||
    input.plannedTraining === "recovery" ||
    input.plannedTraining === "unsure";

  // Prefer plan-entry-driven training banners when incomplete planned work remains.
  // Legacy flag: hasTrainingSession means "day's training is done" for reminders.
  if (
    trainingPlanned &&
    !input.hasTrainingSession &&
    hour >= 8 &&
    hour < 21
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
      priority: hour >= 14 && hour < 18 ? 72 : 58,
    });
  }

  const observation = buildNutritionObservation(input.nutrition, phase);
  if (observation) {
    const coreMealsLogged = (["breakfast", "lunch", "dinner"] as const).every(
      (meal) => hasMeal(input.loggedMealTypes, meal),
    );
    candidates.push({
      ...observation,
      // Prefer observations once meal questions are no longer relevant.
      priority:
        phase === "night" || coreMealsLogged ? 95 : observation.priority,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates;
}

/**
 * Resolve the single most relevant Coach Moment for Today.
 */
export function resolveCoachMoment(input: CoachMomentInput): CoachMoment {
  const candidates = collectCoachMomentCandidates(input);
  if (candidates.length === 0) {
    return {
      type: "all_set",
      phase: resolveDayPhase(input.now),
      kind: "observation",
      title: "You’re in a good place for today.",
      description: "Ask Coach anytime if you want a tweak.",
      showInspirationCta: false,
      priority: 0,
    };
  }
  return candidates[0];
}
