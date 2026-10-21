import { entryDisplayTitle, type NutritionEntryRecord } from "@/lib/nutrition";
import { normalizePortions } from "@/lib/nutrition-portions";

/** Reusable food owned by one user. Past logs keep their own snapshots. */
export type SavedFoodDefinition = {
  id: string;
  name: string;
  aliases: string[];
  servingLabel: string;
  defaultPortions: number;
  caloriesPerPortion: number;
  proteinGPerPortion: number;
  carbsGPerPortion: number;
  fatGPerPortion: number;
};

export type SavedFoodInput = {
  name: string;
  servingLabel: string;
  defaultPortions: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type SavedFoodSnapshot = {
  displayName: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portions: number;
  mealId: string;
  servingLabel: string;
};

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function macro(value: number): number {
  return Math.round(value * 10) / 10;
}

export function validateSavedFood(input: {
  name: unknown;
  servingLabel: unknown;
  defaultPortions: unknown;
  calories: unknown;
  proteinG: unknown;
  carbsG: unknown;
  fatG: unknown;
}): { ok: true; value: SavedFoodInput } | { ok: false; message: string } {
  const name = typeof input.name === "string" ? cleanLabel(input.name) : "";
  if (!name) {
    return { ok: false, message: "Add a food name." };
  }
  if (name.length > 120) {
    return { ok: false, message: "Use a shorter food name." };
  }

  const servingLabel =
    typeof input.servingLabel === "string" ? cleanLabel(input.servingLabel) : "";
  if (!servingLabel) {
    return {
      ok: false,
      message: "Add a serving size, such as 1 scoop or 100 g.",
    };
  }
  if (servingLabel.length > 80) {
    return { ok: false, message: "Use a shorter serving size." };
  }

  const portions = Number(input.defaultPortions);
  if (!Number.isFinite(portions) || portions <= 0 || portions > 12) {
    return { ok: false, message: "Quantity must be greater than 0 and no more than 12." };
  }

  const fields: Array<[string, unknown]> = [
    ["Calories", input.calories],
    ["Protein", input.proteinG],
    ["Carbohydrates", input.carbsG],
    ["Fat", input.fatG],
  ];
  const numbers: number[] = [];
  for (const [label, raw] of fields) {
    if (typeof raw === "string" && raw.trim() === "") {
      return { ok: false, message: `Enter a number for ${label.toLowerCase()}.` };
    }
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) {
      return { ok: false, message: `Enter a number for ${label.toLowerCase()}.` };
    }
    if (value < 0) {
      return { ok: false, message: `${label} must be zero or more.` };
    }
    numbers.push(value);
  }

  return {
    ok: true,
    value: {
      name: name.slice(0, 120),
      servingLabel: servingLabel.slice(0, 80),
      defaultPortions: normalizePortions(portions),
      calories: Math.round(numbers[0]),
      proteinG: macro(numbers[1]),
      carbsG: macro(numbers[2]),
      fatG: macro(numbers[3]),
    },
  };
}

export function findSavedFood(
  foods: SavedFoodDefinition[],
  query: { mealId?: string | null; name?: string | null },
): SavedFoodDefinition | null {
  if (query.mealId) {
    const byId = foods.find((food) => food.id === query.mealId);
    if (byId) {
      return byId;
    }
  }
  const key = query.name?.trim().toLowerCase();
  if (!key) {
    return null;
  }
  return (
    foods.find(
      (food) =>
        food.name.trim().toLowerCase() === key ||
        food.aliases.some((alias) => alias.trim().toLowerCase() === key),
    ) ?? null
  );
}

/** Keep one row per food. A later edit replaces the earlier definition. */
export function upsertSavedFood(
  foods: SavedFoodDefinition[],
  next: SavedFoodDefinition,
): SavedFoodDefinition[] {
  const keys = new Set(
    [next.id, next.name, ...next.aliases].map((value) => value.trim().toLowerCase()),
  );
  const rest = foods.filter((food) => {
    if (food.id === next.id) {
      return false;
    }
    const labels = [food.id, food.name, ...food.aliases];
    return !labels.some((label) => keys.has(label.trim().toLowerCase()));
  });
  return [next, ...rest];
}

export function perPortionMacros(input: SavedFoodInput): {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  const portions = normalizePortions(input.defaultPortions);
  return {
    calories: input.calories / portions,
    proteinG: input.proteinG / portions,
    carbsG: input.carbsG / portions,
    fatG: input.fatG / portions,
  };
}

export function totalsForSavedFood(food: SavedFoodDefinition): SavedFoodInput {
  const portions = normalizePortions(food.defaultPortions);
  return {
    name: food.name,
    servingLabel: food.servingLabel,
    defaultPortions: portions,
    calories: Math.round(food.caloriesPerPortion * portions),
    proteinG: macro(food.proteinGPerPortion * portions),
    carbsG: macro(food.carbsGPerPortion * portions),
    fatG: macro(food.fatGPerPortion * portions),
  };
}

/**
 * Values to show and to copy onto a new log. The original entry is not changed,
 * so a past diary row keeps the nutrition it was saved with.
 */
export function presentSavedFood(
  entry: NutritionEntryRecord,
  food: SavedFoodDefinition,
): NutritionEntryRecord {
  const totals = totalsForSavedFood(food);
  return {
    ...entry,
    display_name: food.name,
    meal_id: food.id,
    portions: totals.defaultPortions,
    calories_estimated: totals.calories,
    protein_g_estimated: totals.proteinG,
    carbs_g_estimated: totals.carbsG,
    fat_g_estimated: totals.fatG,
  };
}

export function overlaySavedFoods(
  entries: NutritionEntryRecord[],
  foods: SavedFoodDefinition[],
): NutritionEntryRecord[] {
  return entries.map((entry) => {
    const food = findSavedFood(foods, {
      mealId: entry.meal_id,
      name: entryDisplayTitle(entry),
    });
    return food ? presentSavedFood(entry, food) : entry;
  });
}

/** New diary row fields. Does not write back to the source log. */
export function snapshotForNewLog(
  entry: NutritionEntryRecord,
  foods: SavedFoodDefinition[],
): SavedFoodSnapshot | null {
  const food = findSavedFood(foods, {
    mealId: entry.meal_id,
    name: entryDisplayTitle(entry),
  });
  if (!food) {
    return null;
  }
  const totals = totalsForSavedFood(food);
  return {
    displayName: food.name,
    calories: totals.calories,
    proteinG: totals.proteinG,
    carbsG: totals.carbsG,
    fatG: totals.fatG,
    portions: totals.defaultPortions,
    mealId: food.id,
    servingLabel: food.servingLabel,
  };
}

export function savedFoodLoggedToday(
  displayKey: string,
  todayKeys: Set<string>,
  foods: SavedFoodDefinition[],
): boolean {
  if (todayKeys.has(displayKey)) {
    return true;
  }
  const food = findSavedFood(foods, { name: displayKey });
  if (!food) {
    return false;
  }
  return [food.name, ...food.aliases].some((label) =>
    todayKeys.has(label.trim().toLowerCase()),
  );
}

export function savedFoodAliases(
  previousName: string,
  existing: string[],
  nextName: string,
): string[] {
  const nextKey = nextName.trim().toLowerCase();
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const label of [previousName, ...existing]) {
    const cleaned = cleanLabel(label);
    const key = cleaned.toLowerCase();
    if (!cleaned || key === nextKey || seen.has(key)) {
      continue;
    }
    seen.add(key);
    aliases.push(cleaned);
    if (aliases.length >= 12) {
      break;
    }
  }
  return aliases;
}
