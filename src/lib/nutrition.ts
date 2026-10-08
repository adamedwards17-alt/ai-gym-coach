export type MealTypeId =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "drink"
  | "other";

export type MealTypeOptionId = MealTypeId | "skip";

export type NutritionEntryDraft = {
  description: string | null;
  mealType: MealTypeId | null;
  mealTypeSkipped: boolean;
};

export type NutritionEntryRecord = {
  id: string;
  logged_date: string;
  meal_type: MealTypeId | null;
  description: string;
  created_at: string;
};

export const mealTypeOptions: { id: MealTypeOptionId; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snack", label: "Snack" },
  { id: "drink", label: "Drink" },
  { id: "other", label: "Other" },
  { id: "skip", label: "Skip" },
];

/** Local calendar day as YYYY-MM-DD — never use UTC toISOString for this. */
export function getLocalLoggedDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidLoggedDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isMealTypeId(value: unknown): value is MealTypeId {
  return (
    value === "breakfast" ||
    value === "lunch" ||
    value === "dinner" ||
    value === "snack" ||
    value === "drink" ||
    value === "other"
  );
}

export function labelForMealType(id: MealTypeId | null): string {
  if (!id) {
    return "No meal type";
  }
  return mealTypeOptions.find((option) => option.id === id)?.label ?? id;
}

export function formatLoggedDateLabel(loggedDate: string): string {
  const today = getLocalLoggedDate();
  if (loggedDate === today) {
    return "Today";
  }

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getLocalLoggedDate(yesterdayDate);
  if (loggedDate === yesterday) {
    return "Yesterday";
  }

  const [year, month, day] = loggedDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function isDraftReadyToSave(draft: NutritionEntryDraft): boolean {
  return (
    typeof draft.description === "string" &&
    draft.description.trim().length > 0 &&
    (draft.mealTypeSkipped || draft.mealType !== null)
  );
}

export function mealTypeFromOption(
  id: MealTypeOptionId,
): MealTypeId | null {
  return id === "skip" ? null : id;
}
