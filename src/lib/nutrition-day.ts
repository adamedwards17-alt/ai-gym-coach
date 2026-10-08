import {
  addMacroTotals,
  calculateNutritionTargets,
  emptyMacroTotals,
  NUTRITION_METHODOLOGY_VERSION,
  remainingMacros,
  type MacroTotals,
} from "@/lib/nutrition-targets";
import {
  isEstimationConfidence,
  isEstimationSource,
  isMealTypeId,
  isNutritionEntryStatus,
  macrosFromEntry,
  type NutritionDaySummary,
  type NutritionEntryRecord,
  type NutritionTargetRecord,
} from "@/lib/nutrition";
import type { SupabaseClient } from "@supabase/supabase-js";

export const NUTRITION_ENTRY_SELECT = [
  "id",
  "logged_date",
  "meal_type",
  "description",
  "status",
  "calories_estimated",
  "protein_g_estimated",
  "carbs_g_estimated",
  "fat_g_estimated",
  "estimation_confidence",
  "estimation_source",
  "created_at",
].join(", ");

/** PostgREST may return int/numeric columns as number or string. */
function toNullableFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toNutritionEntryRecord(
  row: Record<string, unknown>,
): NutritionEntryRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.logged_date !== "string" ||
    typeof row.description !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  const mealType =
    row.meal_type === null || row.meal_type === undefined
      ? null
      : isMealTypeId(row.meal_type)
        ? row.meal_type
        : null;

  if (
    row.meal_type !== null &&
    row.meal_type !== undefined &&
    mealType === null
  ) {
    return null;
  }

  const status = isNutritionEntryStatus(row.status) ? row.status : "eaten";

  return {
    id: row.id,
    logged_date: row.logged_date,
    meal_type: mealType,
    description: row.description,
    status,
    calories_estimated: toNullableFiniteNumber(row.calories_estimated),
    protein_g_estimated: toNullableFiniteNumber(row.protein_g_estimated),
    carbs_g_estimated: toNullableFiniteNumber(row.carbs_g_estimated),
    fat_g_estimated: toNullableFiniteNumber(row.fat_g_estimated),
    estimation_confidence: isEstimationConfidence(row.estimation_confidence)
      ? row.estimation_confidence
      : null,
    estimation_source: isEstimationSource(row.estimation_source)
      ? row.estimation_source
      : null,
    created_at: row.created_at,
  };
}

function toTargetRecord(
  row: Record<string, unknown>,
): NutritionTargetRecord | null {
  if (
    typeof row.daily_calories !== "number" ||
    typeof row.protein_g !== "number" ||
    typeof row.carbs_g !== "number" ||
    typeof row.fat_g !== "number" ||
    typeof row.methodology_version !== "string" ||
    typeof row.calculated_at !== "string"
  ) {
    return null;
  }

  return {
    daily_calories: row.daily_calories,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    methodology_version: row.methodology_version,
    calculated_at: row.calculated_at,
  };
}

export async function ensureNutritionTargetsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  targets: NutritionTargetRecord | null;
  status: NutritionDaySummary["targetsStatus"];
  message: string | null;
}> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "age, sex, height_cm, weight_kg, primary_goal, activity_level, training_frequency",
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("[nutrition-targets] Profile load:", profileError.message);
    return {
      targets: null,
      status: "missing",
      message: "Nutrition targets couldn’t be loaded.",
    };
  }

  if (!profile) {
    return {
      targets: null,
      status: "incomplete",
      message: "Complete your profile to unlock nutrition targets.",
    };
  }

  const calculated = calculateNutritionTargets({
    age: typeof profile.age === "number" ? profile.age : null,
    sex: typeof profile.sex === "string" ? profile.sex : null,
    height_cm: typeof profile.height_cm === "number" ? Number(profile.height_cm) : null,
    weight_kg: typeof profile.weight_kg === "number" ? Number(profile.weight_kg) : null,
    primary_goal:
      typeof profile.primary_goal === "string" ? profile.primary_goal : null,
    activity_level:
      typeof profile.activity_level === "string"
        ? profile.activity_level
        : null,
    training_frequency:
      typeof profile.training_frequency === "string"
        ? profile.training_frequency
        : null,
  });

  if (calculated.status === "incomplete") {
    return {
      targets: null,
      status: "incomplete",
      message: calculated.message,
    };
  }

  if (calculated.status === "review") {
    return {
      targets: null,
      status: "review",
      message: calculated.message,
    };
  }

  const payload = {
    user_id: userId,
    daily_calories: calculated.targets.dailyCalories,
    protein_g: calculated.targets.proteinG,
    carbs_g: calculated.targets.carbsG,
    fat_g: calculated.targets.fatG,
    methodology_version: NUTRITION_METHODOLOGY_VERSION,
    calculated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("nutrition_targets")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "daily_calories, protein_g, carbs_g, fat_g, methodology_version, calculated_at",
    )
    .single();

  if (error || !data) {
    console.error(
      "[nutrition-targets] Upsert failed:",
      error?.message ?? "No row",
    );
    return {
      targets: null,
      status: "missing",
      message: "Nutrition targets couldn’t be saved.",
    };
  }

  const targets = toTargetRecord(data as Record<string, unknown>);
  if (!targets) {
    return {
      targets: null,
      status: "missing",
      message: "Nutrition targets couldn’t be saved.",
    };
  }

  return { targets, status: "ok", message: null };
}

export function summariseNutritionDay(input: {
  localDate: string;
  targets: NutritionTargetRecord | null;
  targetsStatus: NutritionDaySummary["targetsStatus"];
  targetsMessage: string | null;
  entries: NutritionEntryRecord[];
}): NutritionDaySummary {
  const eatenEntries = input.entries.filter(
    (entry) =>
      entry.logged_date === input.localDate && entry.status === "eaten",
  );
  const plannedEntries = input.entries.filter(
    (entry) =>
      entry.logged_date === input.localDate && entry.status === "planned",
  );

  const consumed = eatenEntries.reduce<MacroTotals>((acc, entry) => {
    const macros = macrosFromEntry(entry);
    return addMacroTotals(acc, {
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
    });
  }, emptyMacroTotals());

  const targetTotals: MacroTotals = input.targets
    ? {
        calories: input.targets.daily_calories,
        proteinG: input.targets.protein_g,
        carbsG: input.targets.carbs_g,
        fatG: input.targets.fat_g,
      }
    : emptyMacroTotals();

  const remaining = input.targets
    ? remainingMacros(targetTotals, consumed)
    : emptyMacroTotals();

  return {
    localDate: input.localDate,
    targets: input.targets,
    targetsStatus: input.targetsStatus,
    targetsMessage: input.targetsMessage,
    consumed: {
      calories: Math.round(consumed.calories),
      proteinG: Math.round(consumed.proteinG),
      carbsG: Math.round(consumed.carbsG),
      fatG: Math.round(consumed.fatG),
    },
    remaining: {
      calories: Math.round(remaining.calories),
      proteinG: Math.round(remaining.proteinG),
      carbsG: Math.round(remaining.carbsG),
      fatG: Math.round(remaining.fatG),
    },
    eatenEntries,
    plannedEntries,
  };
}
