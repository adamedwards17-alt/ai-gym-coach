import { shiftCoachDate } from "@/lib/coach";
import {
  entryDisplayTitle,
  labelForMealType,
  type MealTypeId,
  type NutritionEntryRecord,
} from "@/lib/nutrition";
import { normalizePortions } from "@/lib/nutrition-portions";

export type NutritionUsual = {
  key: string;
  sourceEntryId: string;
  name: string;
  mealType: MealTypeId | null;
  portions: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  loggedDate: string;
  createdAt: string;
};

/** How many saved foods a meal picker shows before the list scrolls. */
export const RECENT_FOOD_VISIBLE_COUNT = 3;

export const LOGGED_TODAY_LABEL = "Logged today";

export const ADD_NEW_FOOD_LABEL = "Add a new food or meal";

const MEAL_ORDER: Array<MealTypeId | null> = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "drink",
  "other",
  null,
];

export function nutritionUsualKey(
  entry: Pick<NutritionEntryRecord, "description" | "display_name">,
): string {
  return entryDisplayTitle(entry).trim().toLowerCase();
}

export function formatUsualServing(portions: number | null | undefined): string {
  const amount = normalizePortions(portions);
  if (Math.abs(amount - 1) < 0.001) {
    return "1 serving";
  }
  return `${amount} servings`;
}

function byRecentLog(a: NutritionEntryRecord, b: NutritionEntryRecord): number {
  if (a.logged_date !== b.logged_date) {
    return a.logged_date < b.logged_date ? 1 : -1;
  }
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }
  return 0;
}

function usualFromEntry(entry: NutritionEntryRecord, key: string): NutritionUsual {
  return {
    key,
    sourceEntryId: entry.id,
    name: entryDisplayTitle(entry),
    mealType: entry.meal_type,
    portions: normalizePortions(entry.portions),
    calories: entry.calories_estimated ?? 0,
    proteinG: Number(entry.protein_g_estimated ?? 0),
    carbsG: Number(entry.carbs_g_estimated ?? 0),
    fatG: Number(entry.fat_g_estimated ?? 0),
    loggedDate: entry.logged_date,
    createdAt: entry.created_at,
  };
}

/**
 * One usual per food name. The newest log supplies the category, serving
 * and macros. Older diary rows are left unchanged.
 */
export function buildNutritionUsuals(
  entries: NutritionEntryRecord[],
): NutritionUsual[] {
  const ordered = [...entries].sort(byRecentLog);
  const seen = new Set<string>();
  const usuals: NutritionUsual[] = [];
  for (const entry of ordered) {
    if (entry.calories_estimated == null) {
      continue;
    }
    const key = nutritionUsualKey(entry);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    usuals.push(usualFromEntry(entry, key));
  }
  return usuals;
}

/**
 * Newest successful log of each food inside one meal.
 * A later snack does not remove or reorder that food in lunch.
 */
export function recentUsualsForMeal(
  entries: NutritionEntryRecord[],
  mealType: MealTypeId | null,
): NutritionUsual[] {
  const ordered = [...entries].sort(byRecentLog);
  const seen = new Set<string>();
  const usuals: NutritionUsual[] = [];
  for (const entry of ordered) {
    if (entry.meal_type !== mealType || entry.calories_estimated == null) {
      continue;
    }
    const key = nutritionUsualKey(entry);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    usuals.push(usualFromEntry(entry, key));
  }
  return usuals;
}

export function compareUsualsByRecency(a: NutritionUsual, b: NutritionUsual): number {
  if (a.loggedDate !== b.loggedDate) {
    return a.loggedDate < b.loggedDate ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  return 0;
}

/** Each meal keeps its own history, newest log first. Empty meals are omitted. */
export function recentUsualGroups(
  entries: NutritionEntryRecord[],
): Array<{ mealType: MealTypeId | null; label: string; items: NutritionUsual[] }> {
  return MEAL_ORDER.flatMap((mealType) => {
    const items = recentUsualsForMeal(entries, mealType);
    if (items.length === 0) {
      return [];
    }
    return [
      {
        mealType,
        label: mealType ? labelForMealType(mealType) : "No meal type",
        items,
      },
    ];
  });
}

export function groupNutritionUsuals(
  usuals: NutritionUsual[],
): Array<{ mealType: MealTypeId | null; label: string; items: NutritionUsual[] }> {
  return MEAL_ORDER.flatMap((mealType) => {
    const items = usuals.filter((item) => item.mealType === mealType);
    if (items.length === 0) {
      return [];
    }
    return [
      {
        mealType,
        label: mealType ? labelForMealType(mealType) : "No meal type",
        items,
      },
    ];
  });
}

/** Eaten foods for this date. A meal filter keeps the label specific to that list. */
export function loggedTodayKeys(
  entries: NutritionEntryRecord[],
  mealType?: MealTypeId,
): Set<string> {
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry.status !== "eaten") {
      continue;
    }
    if (mealType && entry.meal_type !== mealType) {
      continue;
    }
    const key = nutritionUsualKey(entry);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Rows to insert. Duplicates are allowed so a second serving is a new log,
 * not an update of the earlier one. Repeat-yesterday still skips names
 * already on the day.
 */
export function entriesToCopy(
  sources: NutritionEntryRecord[],
  existing: NutritionEntryRecord[],
  options?: { allowDuplicates?: boolean },
): NutritionEntryRecord[] {
  if (options?.allowDuplicates) {
    const seen = new Set<string>();
    const copy: NutritionEntryRecord[] = [];
    for (const entry of sources) {
      if (seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      copy.push(entry);
    }
    return copy;
  }
  return entriesNotAlreadyLogged(sources, existing);
}

export function entriesNotAlreadyLogged(
  incoming: NutritionEntryRecord[],
  existing: NutritionEntryRecord[],
): NutritionEntryRecord[] {
  const present = new Set(existing.map((entry) => nutritionUsualKey(entry)));
  const seen = new Set<string>();
  const copy: NutritionEntryRecord[] = [];
  for (const entry of incoming) {
    const key = nutritionUsualKey(entry);
    if (!key || present.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    copy.push(entry);
  }
  return copy;
}

export function sumUsualMacros(usuals: NutritionUsual[]): {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  return usuals.reduce(
    (total, item) => ({
      calories: total.calories + item.calories,
      proteinG: total.proteinG + item.proteinG,
      carbsG: total.carbsG + item.carbsG,
      fatG: total.fatG + item.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

export function yesterdayLoggedDate(loggedDate: string): string {
  return shiftCoachDate(loggedDate, -1);
}
