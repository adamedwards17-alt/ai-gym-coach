export type MealTypeId =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "drink"
  | "other";

export type MealTypeOptionId = MealTypeId | "skip";

export type NutritionEntryStatus = "eaten" | "planned";

export type NutritionEstimationConfidence = "high" | "medium" | "low";

export type NutritionEstimationSource = "gemini" | "user" | "none";

export type NutritionEntryDraft = {
  description: string | null;
  mealType: MealTypeId | null;
  mealTypeSkipped: boolean;
  status: NutritionEntryStatus;
};

export type NutritionEstimate = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  confidence: NutritionEstimationConfidence;
  source: NutritionEstimationSource;
  items: Array<{
    description: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    confidence: NutritionEstimationConfidence;
  }>;
};

export type NutritionEntryRecord = {
  id: string;
  logged_date: string;
  meal_type: MealTypeId | null;
  description: string;
  status: NutritionEntryStatus;
  calories_estimated: number | null;
  protein_g_estimated: number | null;
  carbs_g_estimated: number | null;
  fat_g_estimated: number | null;
  estimation_confidence: NutritionEstimationConfidence | null;
  estimation_source: NutritionEstimationSource | null;
  created_at: string;
};

export type NutritionTargetRecord = {
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  methodology_version: string;
  calculated_at: string;
};

export type NutritionDaySummary = {
  localDate: string;
  targets: NutritionTargetRecord | null;
  targetsStatus: "ok" | "incomplete" | "review" | "missing";
  targetsMessage: string | null;
  consumed: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  remaining: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  eatenEntries: NutritionEntryRecord[];
  plannedEntries: NutritionEntryRecord[];
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

export const nutritionStatusOptions: {
  id: NutritionEntryStatus;
  label: string;
}[] = [
  { id: "eaten", label: "Already eaten" },
  { id: "planned", label: "Planned" },
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

export function isNutritionEntryStatus(
  value: unknown,
): value is NutritionEntryStatus {
  return value === "eaten" || value === "planned";
}

export function isEstimationConfidence(
  value: unknown,
): value is NutritionEstimationConfidence {
  return value === "high" || value === "medium" || value === "low";
}

export function isEstimationSource(
  value: unknown,
): value is NutritionEstimationSource {
  return value === "gemini" || value === "user" || value === "none";
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

export function isDraftReadyToEstimate(draft: NutritionEntryDraft): boolean {
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

export function macrosFromEntry(entry: NutritionEntryRecord): {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  return {
    calories: entry.calories_estimated ?? 0,
    proteinG: Number(entry.protein_g_estimated ?? 0),
    carbsG: Number(entry.carbs_g_estimated ?? 0),
    fatG: Number(entry.fat_g_estimated ?? 0),
  };
}

function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as unknown;
    } catch {
      // continue
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }

  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseFoodEstimationResponse(
  raw: string,
): NutritionEstimate | null {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const totals =
    record.totals && typeof record.totals === "object" && !Array.isArray(record.totals)
      ? (record.totals as Record<string, unknown>)
      : null;

  const calories = toFiniteNumber(totals?.calories ?? record.calories);
  const proteinG = toFiniteNumber(totals?.protein_g ?? record.protein_g);
  const carbsG = toFiniteNumber(totals?.carbs_g ?? record.carbs_g);
  const fatG = toFiniteNumber(totals?.fat_g ?? record.fat_g);

  if (
    calories == null ||
    proteinG == null ||
    carbsG == null ||
    fatG == null ||
    calories < 0 ||
    proteinG < 0 ||
    carbsG < 0 ||
    fatG < 0
  ) {
    return null;
  }

  const confidence = isEstimationConfidence(record.confidence)
    ? record.confidence
    : "medium";

  const items: NutritionEstimate["items"] = [];
  if (Array.isArray(record.items)) {
    for (const item of record.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const row = item as Record<string, unknown>;
      const itemCalories = toFiniteNumber(row.calories);
      const itemProtein = toFiniteNumber(row.protein_g);
      const itemCarbs = toFiniteNumber(row.carbs_g);
      const itemFat = toFiniteNumber(row.fat_g);
      if (
        typeof row.description !== "string" ||
        itemCalories == null ||
        itemProtein == null ||
        itemCarbs == null ||
        itemFat == null
      ) {
        continue;
      }
      items.push({
        description: row.description.trim(),
        calories: Math.round(itemCalories),
        proteinG: Math.round(itemProtein),
        carbsG: Math.round(itemCarbs),
        fatG: Math.round(itemFat),
        confidence: isEstimationConfidence(row.confidence)
          ? row.confidence
          : confidence,
      });
    }
  }

  return {
    calories: Math.round(calories),
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbsG),
    fatG: Math.round(fatG),
    confidence,
    source: "gemini",
    items,
  };
}

export function formatEstimateSummary(estimate: NutritionEstimate): string {
  const macros = `${estimate.proteinG}g protein · ${estimate.carbsG}g carbs · ${estimate.fatG}g fat`;
  if (estimate.confidence === "low") {
    return `~${estimate.calories} kcal · rough estimate · ${macros}`;
  }
  return `~${estimate.calories} kcal · ${macros}`;
}
