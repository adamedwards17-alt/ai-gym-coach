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
  "display_name",
  "search_aliases",
  "barcode",
  "brand",
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

  const searchAliases = Array.isArray(row.search_aliases)
    ? row.search_aliases.filter((value): value is string => typeof value === "string")
    : [];

  return {
    id: row.id,
    logged_date: row.logged_date,
    meal_type: mealType,
    description: row.description,
    display_name:
      typeof row.display_name === "string" && row.display_name.trim()
        ? row.display_name.trim()
        : null,
    search_aliases: searchAliases,
    barcode:
      typeof row.barcode === "string" && row.barcode.trim()
        ? row.barcode.trim()
        : null,
    brand:
      typeof row.brand === "string" && row.brand.trim()
        ? row.brand.trim()
        : null,
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
  const daily = toNullableFiniteNumber(row.daily_calories);
  const protein = toNullableFiniteNumber(row.protein_g);
  const carbs = toNullableFiniteNumber(row.carbs_g);
  const fat = toNullableFiniteNumber(row.fat_g);
  if (
    daily == null ||
    protein == null ||
    carbs == null ||
    fat == null ||
    typeof row.methodology_version !== "string" ||
    typeof row.calculated_at !== "string"
  ) {
    return null;
  }

  return {
    daily_calories: Math.round(daily),
    protein_g: Math.round(protein),
    carbs_g: Math.round(carbs),
    fat_g: Math.round(fat),
    methodology_version: row.methodology_version,
    calculated_at: row.calculated_at,
    is_manual: row.is_manual === true,
  };
}

async function appendTargetHistory(
  supabase: SupabaseClient,
  input: {
    userId: string;
    targets: NutritionTargetRecord;
    previous: NutritionTargetRecord | null;
    source: string;
    reason?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("nutrition_target_history").insert({
    user_id: input.userId,
    daily_calories: input.targets.daily_calories,
    protein_g: input.targets.protein_g,
    carbs_g: input.targets.carbs_g,
    fat_g: input.targets.fat_g,
    methodology_version: input.targets.methodology_version,
    is_manual: input.targets.is_manual,
    source: input.source,
    reason: input.reason ?? null,
    previous_daily_calories: input.previous?.daily_calories ?? null,
    previous_protein_g: input.previous?.protein_g ?? null,
    previous_carbs_g: input.previous?.carbs_g ?? null,
    previous_fat_g: input.previous?.fat_g ?? null,
  });
  if (error) {
    console.error("[nutrition-targets] History insert failed:", error.message);
  }
}

export async function ensureNutritionTargetsForUser(
  supabase: SupabaseClient,
  userId: string,
  options?: { forceRecalculate?: boolean },
): Promise<{
  targets: NutritionTargetRecord | null;
  status: NutritionDaySummary["targetsStatus"];
  message: string | null;
}> {
  const { data: existingRow } = await supabase
    .from("nutrition_targets")
    .select(
      "daily_calories, protein_g, carbs_g, fat_g, methodology_version, calculated_at, is_manual",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const existing = existingRow
    ? toTargetRecord(existingRow as Record<string, unknown>)
    : null;

  // Preserve manual targets unless the caller explicitly recalculates.
  if (existing?.is_manual && !options?.forceRecalculate) {
    return { targets: existing, status: "ok", message: null };
  }

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

  const unchanged =
    existing &&
    existing.daily_calories === calculated.targets.dailyCalories &&
    existing.protein_g === calculated.targets.proteinG &&
    existing.carbs_g === calculated.targets.carbsG &&
    existing.fat_g === calculated.targets.fatG &&
    !options?.forceRecalculate;

  if (unchanged) {
    return { targets: existing, status: "ok", message: null };
  }

  // Avoid noisy auto-adjustments from small weigh-in fluctuations.
  // Meaningful target changes require explicit confirmation (forceRecalculate).
  const MEANINGFUL_CALORIE_DELTA = 100;
  if (
    existing &&
    !options?.forceRecalculate &&
    Math.abs(existing.daily_calories - calculated.targets.dailyCalories) >=
      MEANINGFUL_CALORIE_DELTA
  ) {
    return {
      targets: existing,
      status: "ok",
      message: null,
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
    is_manual: false,
  };

  const { data, error } = await supabase
    .from("nutrition_targets")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "daily_calories, protein_g, carbs_g, fat_g, methodology_version, calculated_at, is_manual",
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

  await appendTargetHistory(supabase, {
    userId,
    targets,
    previous: existing,
    source: options?.forceRecalculate ? "profile_recalc" : "auto",
  });

  return { targets, status: "ok", message: null };
}

/** Apply confirmed nutrition targets (manual or accepted proposal). */
export async function applyNutritionTargetsForUser(
  supabase: SupabaseClient,
  input: {
    userId: string;
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    isManual: boolean;
    source: string;
    reason?: string | null;
  },
): Promise<{
  targets: NutritionTargetRecord | null;
  status: "ok" | "error";
  message: string | null;
}> {
  const { data: existingRow } = await supabase
    .from("nutrition_targets")
    .select(
      "daily_calories, protein_g, carbs_g, fat_g, methodology_version, calculated_at, is_manual",
    )
    .eq("user_id", input.userId)
    .maybeSingle();
  const existing = existingRow
    ? toTargetRecord(existingRow as Record<string, unknown>)
    : null;

  const payload = {
    user_id: input.userId,
    daily_calories: Math.round(input.dailyCalories),
    protein_g: Math.round(input.proteinG),
    carbs_g: Math.round(input.carbsG),
    fat_g: Math.round(input.fatG),
    methodology_version: NUTRITION_METHODOLOGY_VERSION,
    calculated_at: new Date().toISOString(),
    is_manual: input.isManual,
  };

  const { data, error } = await supabase
    .from("nutrition_targets")
    .upsert(payload, { onConflict: "user_id" })
    .select(
      "daily_calories, protein_g, carbs_g, fat_g, methodology_version, calculated_at, is_manual",
    )
    .single();

  if (error || !data) {
    return {
      targets: null,
      status: "error",
      message: "Those targets couldn’t be saved.",
    };
  }

  const targets = toTargetRecord(data as Record<string, unknown>);
  if (!targets) {
    return {
      targets: null,
      status: "error",
      message: "Those targets couldn’t be saved.",
    };
  }

  const identical =
    existing &&
    existing.daily_calories === targets.daily_calories &&
    existing.protein_g === targets.protein_g &&
    existing.carbs_g === targets.carbs_g &&
    existing.fat_g === targets.fat_g &&
    existing.is_manual === targets.is_manual;

  if (!identical) {
    await appendTargetHistory(supabase, {
      userId: input.userId,
      targets,
      previous: existing,
      source: input.source,
      reason: input.reason,
    });
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
