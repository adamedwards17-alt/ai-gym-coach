/**
 * Contextual next-action engine for Today (and future push notifications).
 * Time-of-day is one input — not the only input.
 *
 * Flow (future):
 *   Next Action engine → Today banner → push notification
 */

import type { PlanId } from "@/lib/today";
import type { MealTypeId } from "@/lib/nutrition";

export type NextActionType =
  | "morning_check_in"
  | "breakfast"
  | "lunch"
  | "snack"
  | "dinner"
  | "training"
  | "recovery"
  | "all_caught_up";

export type NextActionHref =
  | "/nutrition"
  | `/nutrition?meal=${MealTypeId}`
  | "/train"
  | "/coach"
  | "/today#check-in";

export type NextAction = {
  type: NextActionType;
  title: string;
  description: string;
  /** Navigational / CTA payload — reusable by Today UI and future push. */
  action: {
    label: string;
    href: NextActionHref;
  };
  priority: number;
};

export type NextActionInput = {
  now: Date;
  hasCheckIn: boolean;
  plannedTraining: PlanId | null;
  loggedMealTypes: Array<MealTypeId | null>;
  hasTrainingSession: boolean;
};

function hourOf(now: Date): number {
  return now.getHours();
}

function hasMeal(
  logged: Array<MealTypeId | null>,
  meal: MealTypeId,
): boolean {
  return logged.includes(meal);
}

/**
 * Score how relevant a meal reminder is right now.
 * Higher = more relevant. Already-logged meals return null.
 */
function mealCandidate(
  meal: Extract<MealTypeId, "breakfast" | "lunch" | "snack" | "dinner">,
  hour: number,
  logged: Array<MealTypeId | null>,
): NextAction | null {
  if (hasMeal(logged, meal)) {
    return null;
  }

  if (meal === "breakfast") {
    const priority =
      hour < 11 ? 90 : hour < 14 ? 70 : hour < 16 ? 40 : 0;
    if (priority <= 0) {
      return null;
    }
    return {
      type: "breakfast",
      title: "Don’t forget to log your breakfast",
      description: "A quick log keeps today’s nutrition on track.",
      action: {
        label: "Log breakfast",
        href: "/nutrition?meal=breakfast",
      },
      priority,
    };
  }

  if (meal === "lunch") {
    const priority =
      hour < 11 ? 20 : hour < 15 ? 85 : hour < 17 ? 65 : hour < 19 ? 35 : 0;
    if (priority <= 0) {
      return null;
    }
    return {
      type: "lunch",
      title: "What’s on the menu for lunch?",
      description: "Log lunch when you’re ready — estimated macros welcome.",
      action: {
        label: "Log lunch",
        href: "/nutrition?meal=lunch",
      },
      priority,
    };
  }

  if (meal === "snack") {
    if (!hasMeal(logged, "lunch") && hour < 14) {
      return null;
    }
    const priority =
      hour < 13 ? 10 : hour < 17 ? 55 : hour < 19 ? 35 : 0;
    if (priority <= 0) {
      return null;
    }
    return {
      type: "snack",
      title: "Had anything since lunch?",
      description: "Snacks and drinks count — log them if you’ve had any.",
      action: {
        label: "Log snack",
        href: "/nutrition?meal=snack",
      },
      priority,
    };
  }

  if (meal === "dinner") {
    const priority =
      hour < 16 ? 15 : hour < 18 ? 50 : hour < 22 ? 88 : 60;
    if (priority <= 0) {
      return null;
    }
    return {
      type: "dinner",
      title: "Don’t forget to log dinner",
      description: "Finish the day with a clear picture of what you ate.",
      action: {
        label: "Log dinner",
        href: "/nutrition?meal=dinner",
      },
      priority,
    };
  }

  return null;
}

export function resolveNextAction(input: NextActionInput): NextAction {
  const hour = hourOf(input.now);
  const candidates: NextAction[] = [];

  if (!input.hasCheckIn) {
    candidates.push({
      type: "morning_check_in",
      title:
        hour < 12
          ? "How are you feeling this morning?"
          : "Start today’s check-in",
      description:
        "A quick recovery check sets up training and nutrition for the day.",
      action: {
        label: "Start check-in",
        href: "/today#check-in",
      },
      priority: hour < 12 ? 100 : hour < 17 ? 92 : 75,
    });
  }

  const meals: Array<"breakfast" | "lunch" | "snack" | "dinner"> = [
    "breakfast",
    "lunch",
    "snack",
    "dinner",
  ];
  for (const meal of meals) {
    const candidate = mealCandidate(meal, hour, input.loggedMealTypes);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  const trainingPlanned =
    input.plannedTraining === "strength" ||
    input.plannedTraining === "hiit" ||
    input.plannedTraining === "recovery";

  if (input.hasCheckIn && trainingPlanned && !input.hasTrainingSession) {
    candidates.push({
      type: "training",
      title:
        hour < 12
          ? "Training is on the plan today"
          : hour < 18
            ? "Ready to train when you are"
            : "Log today’s session if you trained",
      description: "Open Train to log what you did — or update the plan.",
      action: {
        label: "Log workout",
        href: "/train",
      },
      priority: hour >= 10 && hour < 20 ? 60 : 45,
    });
  }

  if (candidates.length === 0) {
    return {
      type: "all_caught_up",
      title: "You’re all caught up today.",
      description: "Nice work. Ask Coach anytime if you want a tweak.",
      action: {
        label: "Ask Coach",
        href: "/coach",
      },
      priority: 0,
    };
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0];
}
