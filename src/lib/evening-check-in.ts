import { isValidCheckInDate } from "@/lib/check-ins";
import {
  shiftCalendarDate,
  zonedClock,
} from "@/lib/coaching-notifications";
import {
  entryDisplayTitle,
  labelForMealType,
  type MealTypeId,
  type NutritionEntryRecord,
} from "@/lib/nutrition";
import { formatUsualServing, nutritionUsualKey } from "@/lib/nutrition-usuals";

export const EVENING_MAIN_MEALS = ["breakfast", "lunch", "dinner"] as const;

export type EveningMainMeal = (typeof EVENING_MAIN_MEALS)[number];

export type EveningTrainingAnswer = "rest" | "forgot";

export type EveningMealAnswer = "skipped" | "later";

export type EveningHunger = "low" | "steady" | "high";

export type EveningSoreness = "fine" | "some" | "sore";

export type EveningReadiness = "ready" | "okay" | "need_rest";

export type EveningAnswers = {
  training?: EveningTrainingAnswer;
  meals: Partial<Record<EveningMainMeal, EveningMealAnswer>>;
  extras?: "none";
  energy?: 1 | 2 | 3 | 4 | 5;
  hunger?: EveningHunger;
  soreness?: EveningSoreness;
  readiness?: EveningReadiness;
  completedAt?: string | null;
};

export type EveningWorkout = {
  title: string;
  trainingType: string;
  durationMinutes: number | null;
};

export type EveningDay = {
  meals: NutritionEntryRecord[];
  loggedWorkout: EveningWorkout | null;
  plannedTitle: string | null;
  morningEnergy: number | null;
  morningSleep: string | null;
};

export type EveningStep =
  | { id: "training"; kind: "training"; prompt: string; detail: string | null }
  | { id: EveningMainMeal; kind: "meal"; meal: EveningMainMeal; prompt: string }
  | { id: "extras"; kind: "extras"; prompt: string }
  | {
      id: "energy" | "hunger" | "soreness" | "readiness";
      kind: "choice";
      prompt: string;
      options: { id: string; label: string }[];
    };

export type EveningFoodLine = {
  id: string;
  title: string;
  serving: string;
  nutrition: string;
  planned: boolean;
};

export type EveningDiaryGroup = {
  id: string;
  label: string;
  items: EveningFoodLine[];
};

export type EveningPlan = {
  mode: "questions" | "review";
  steps: EveningStep[];
  answered: number;
  remaining: number;
  loggedWorkout: EveningWorkout | null;
  diary: EveningDiaryGroup[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
};

const EMPTY_ANSWERS: EveningAnswers = { meals: {} };

export function emptyEveningAnswers(): EveningAnswers {
  return { meals: {} };
}

export function isEveningDateAllowed(
  date: string,
  now: Date,
  timeZone: string,
): boolean {
  if (!isValidCheckInDate(date)) {
    return false;
  }
  const today = zonedClock(now, timeZone).date;
  const yesterday = shiftCalendarDate(today, -1);
  return date === today || date === yesterday;
}

export function eveningReviewIsComplete(value: unknown): boolean {
  return typeof parseEveningAnswers(value)?.completedAt === "string";
}

export function parseEveningAnswers(value: unknown): EveningAnswers | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const answers: EveningAnswers = { meals: {} };
  if (record.training === "rest" || record.training === "forgot") {
    answers.training = record.training;
  }
  if (record.meals && typeof record.meals === "object") {
    const meals = record.meals as Record<string, unknown>;
    for (const meal of EVENING_MAIN_MEALS) {
      const answer = meals[meal];
      if (answer === "skipped" || answer === "later") {
        answers.meals[meal] = answer;
      }
    }
  }
  if (record.extras === "none") {
    answers.extras = "none";
  }
  if (
    record.energy === 1 ||
    record.energy === 2 ||
    record.energy === 3 ||
    record.energy === 4 ||
    record.energy === 5
  ) {
    answers.energy = record.energy;
  }
  if (record.hunger === "low" || record.hunger === "steady" || record.hunger === "high") {
    answers.hunger = record.hunger;
  }
  if (
    record.soreness === "fine" ||
    record.soreness === "some" ||
    record.soreness === "sore"
  ) {
    answers.soreness = record.soreness;
  }
  if (
    record.readiness === "ready" ||
    record.readiness === "okay" ||
    record.readiness === "need_rest"
  ) {
    answers.readiness = record.readiness;
  }
  if (typeof record.completedAt === "string" && record.completedAt) {
    answers.completedAt = record.completedAt;
  }
  return answers;
}

export function foodAlreadyLogged(
  entries: NutritionEntryRecord[],
  description: string,
): boolean {
  const key = description.trim().toLowerCase();
  if (!key) {
    return false;
  }
  return entries.some(
    (entry) =>
      entry.status === "eaten" && nutritionUsualKey(entry) === key,
  );
}

function eatenOf(
  meals: NutritionEntryRecord[],
  meal: MealTypeId,
): NutritionEntryRecord[] {
  return meals.filter(
    (entry) => entry.status === "eaten" && entry.meal_type === meal,
  );
}

function applicableSteps(day: EveningDay): EveningStep[] {
  const steps: EveningStep[] = [];
  if (!day.loggedWorkout) {
    steps.push({
      id: "training",
      kind: "training",
      prompt: "Did you train today?",
      detail: day.plannedTitle
        ? `${day.plannedTitle} is on the plan, and nothing is logged yet.`
        : "Nothing is logged yet. A rest day and a forgotten log are both fine.",
    });
  }
  for (const meal of EVENING_MAIN_MEALS) {
    if (eatenOf(day.meals, meal).length > 0) {
      continue;
    }
    const label = labelForMealType(meal).toLowerCase();
    steps.push({
      id: meal,
      kind: "meal",
      meal,
      prompt: `You haven’t logged ${label}. Did you have ${label}?`,
    });
  }
  const snacks = [...eatenOf(day.meals, "snack"), ...eatenOf(day.meals, "drink")];
  const mainsLogged = EVENING_MAIN_MEALS.every(
    (meal) => eatenOf(day.meals, meal).length > 0,
  );
  if (!(mainsLogged && snacks.length > 0)) {
    steps.push({
      id: "extras",
      kind: "extras",
      prompt: snacks.length
        ? "Have you had any extra snacks, drinks or portions that aren’t in your diary?"
        : "Have you had any snacks or drinks that aren’t in your diary?",
    });
  }
  if (day.morningEnergy == null) {
    steps.push({
      id: "energy",
      kind: "choice",
      prompt: "How is your energy?",
      options: [1, 2, 3, 4, 5].map((value) => ({
        id: String(value),
        label: String(value),
      })),
    });
  }
  steps.push({
    id: "hunger",
    kind: "choice",
    prompt: "How is your appetite?",
    options: [
      { id: "low", label: "Low" },
      { id: "steady", label: "Steady" },
      { id: "high", label: "Hungry" },
    ],
  });
  steps.push({
    id: "soreness",
    kind: "choice",
    prompt: "How do your muscles feel?",
    options: [
      { id: "fine", label: "Fine" },
      { id: "some", label: "A bit sore" },
      { id: "sore", label: "Very sore" },
    ],
  });
  if (!day.morningSleep) {
    steps.push({
      id: "readiness",
      kind: "choice",
      prompt: "How ready do you feel for tomorrow?",
      options: [
        { id: "ready", label: "Ready" },
        { id: "okay", label: "Okay" },
        { id: "need_rest", label: "Need rest" },
      ],
    });
  }
  return steps;
}

function stepAnswered(step: EveningStep, answers: EveningAnswers): boolean {
  if (step.kind === "training") {
    return answers.training === "rest" || answers.training === "forgot";
  }
  if (step.kind === "meal") {
    return answers.meals[step.meal] === "skipped" || answers.meals[step.meal] === "later";
  }
  if (step.kind === "extras") {
    return answers.extras === "none";
  }
  if (step.id === "energy") {
    return answers.energy != null;
  }
  if (step.id === "hunger") {
    return answers.hunger != null;
  }
  if (step.id === "soreness") {
    return answers.soreness != null;
  }
  return answers.readiness != null;
}

function foodLine(entry: NutritionEntryRecord): EveningFoodLine {
  const portions = entry.portions ?? 1;
  const calories = entry.calories_estimated;
  const protein = entry.protein_g_estimated;
  const parts = [
    calories != null ? `${Math.round(calories)} kcal` : null,
    protein != null ? `${Math.round(protein)}g protein` : null,
  ].filter((part): part is string => Boolean(part));
  return {
    id: entry.id,
    title: entryDisplayTitle(entry),
    serving: formatUsualServing(portions),
    nutrition: parts.join(" · "),
    planned: entry.status === "planned",
  };
}

export function buildEveningDiary(meals: NutritionEntryRecord[]): {
  groups: EveningDiaryGroup[];
  totals: EveningPlan["totals"];
} {
  const groups: EveningDiaryGroup[] = [
    { id: "breakfast", label: "Breakfast", items: [] },
    { id: "lunch", label: "Lunch", items: [] },
    { id: "dinner", label: "Dinner", items: [] },
    { id: "snacks", label: "Snacks and drinks", items: [] },
  ];
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  for (const entry of meals) {
    const line = foodLine(entry);
    if (entry.meal_type === "breakfast" || entry.meal_type === "lunch" || entry.meal_type === "dinner") {
      groups.find((group) => group.id === entry.meal_type)?.items.push(line);
    } else {
      groups[3]?.items.push(line);
    }
    if (entry.status === "eaten") {
      totals.calories += entry.calories_estimated ?? 0;
      totals.proteinG += entry.protein_g_estimated ?? 0;
      totals.carbsG += entry.carbs_g_estimated ?? 0;
      totals.fatG += entry.fat_g_estimated ?? 0;
    }
  }
  return {
    groups: groups.filter((group) => group.items.length > 0),
    totals: {
      calories: Math.round(totals.calories),
      proteinG: Math.round(totals.proteinG),
      carbsG: Math.round(totals.carbsG),
      fatG: Math.round(totals.fatG),
    },
  };
}

export function buildEveningPlan(day: EveningDay, saved: EveningAnswers | null): EveningPlan {
  const answers = saved ?? EMPTY_ANSWERS;
  const applicable = applicableSteps(day);
  const diary = buildEveningDiary(day.meals);
  if (answers.completedAt) {
    return {
      mode: "review",
      steps: [],
      answered: applicable.length,
      remaining: 0,
      loggedWorkout: day.loggedWorkout,
      diary: diary.groups,
      totals: diary.totals,
    };
  }
  const remaining = applicable.filter((step) => !stepAnswered(step, answers));
  return {
    mode: "questions",
    steps: remaining,
    answered: applicable.length - remaining.length,
    remaining: remaining.length,
    loggedWorkout: day.loggedWorkout,
    diary: diary.groups,
    totals: diary.totals,
  };
}

export function eveningCanFinish(day: EveningDay, answers: EveningAnswers): boolean {
  return buildEveningPlan(day, answers).remaining === 0 && !answers.completedAt;
}
