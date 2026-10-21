"use server";

import { getCurrentUser, isLocalPreviewActive } from "@/lib/auth/session";
import { previewNutritionEntries } from "@/lib/local-preview-data";
import {
  entryDisplayTitle,
  getLocalLoggedDate,
  type NutritionEntryRecord,
} from "@/lib/nutrition";
import { NUTRITION_ENTRY_SELECT, toNutritionEntryRecord } from "@/lib/nutrition-day";
import {
  findSavedFood,
  overlaySavedFoods,
  perPortionMacros,
  savedFoodAliases,
  validateSavedFood,
  type SavedFoodDefinition,
} from "@/lib/saved-food";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const SAVED_FOOD_SELECT = [
  "id",
  "name",
  "search_aliases",
  "serving_label",
  "default_portions",
  "calories_per_portion",
  "protein_g_per_portion",
  "carbs_g_per_portion",
  "fat_g_per_portion",
].join(", ");

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function savedFoodFromRow(row: Record<string, unknown>): SavedFoodDefinition | null {
  if (typeof row.id !== "string" || typeof row.name !== "string" || !row.name.trim()) {
    return null;
  }
  const aliases = Array.isArray(row.search_aliases)
    ? row.search_aliases.filter((alias): alias is string => typeof alias === "string")
    : [];
  const portions = numberOr(row.default_portions, 1);
  return {
    id: row.id,
    name: row.name.trim(),
    aliases,
    servingLabel:
      typeof row.serving_label === "string" && row.serving_label.trim()
        ? row.serving_label.trim()
        : portions === 1
          ? "1 serving"
          : `${portions} servings`,
    defaultPortions: portions > 0 && portions <= 12 ? portions : 1,
    caloriesPerPortion: numberOr(row.calories_per_portion, 0),
    proteinGPerPortion: numberOr(row.protein_g_per_portion, 0),
    carbsGPerPortion: numberOr(row.carbs_g_per_portion, 0),
    fatGPerPortion: numberOr(row.fat_g_per_portion, 0),
  };
}

export async function loadSavedFoodDefinitions(): Promise<
  | { status: "ok"; foods: SavedFoodDefinition[] }
  | { status: "error"; message: string }
> {
  if (await isLocalPreviewActive()) {
    return { status: "ok", foods: [] };
  }
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nutrition_meals")
      .select(SAVED_FOOD_SELECT)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[nutrition] Saved foods failed:", error.message);
      return { status: "error", message: "Saved foods couldn’t be loaded." };
    }
    const foods = (data ?? [])
      .map((row) => savedFoodFromRow(row as unknown as Record<string, unknown>))
      .filter((food): food is SavedFoodDefinition => food !== null);
    return { status: "ok", foods };
  } catch (error) {
    console.error(
      "[nutrition] Saved foods failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return { status: "error", message: "Saved foods couldn’t be loaded." };
  }
}

export async function updateSavedFood(input: {
  sourceEntryId: string;
  name: string;
  servingLabel: string;
  defaultPortions: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Promise<
  | { status: "ok"; food: SavedFoodDefinition }
  | { status: "error"; message: string }
> {
  const parsed = validateSavedFood(input);
  if (!parsed.ok) {
    return { status: "error", message: parsed.message };
  }
  const sourceEntryId = input.sourceEntryId.trim();
  if (!sourceEntryId) {
    return { status: "error", message: "That food couldn’t be found." };
  }

  const value = parsed.value;
  const portions = perPortionMacros(value);

  if (await isLocalPreviewActive()) {
    const source = previewNutritionEntries(getLocalLoggedDate()).find(
      (entry) => entry.id === sourceEntryId,
    );
    const previousName = source ? entryDisplayTitle(source) : value.name;
    return {
      status: "ok",
      food: {
        id: `preview-${sourceEntryId}`,
        name: value.name,
        aliases: savedFoodAliases(previousName, [], value.name),
        servingLabel: value.servingLabel,
        defaultPortions: value.defaultPortions,
        caloriesPerPortion: portions.calories,
        proteinGPerPortion: portions.proteinG,
        carbsGPerPortion: portions.carbsG,
        fatGPerPortion: portions.fatG,
      },
    };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data: sourceRow, error: sourceError } = await supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .eq("id", sourceEntryId)
      .maybeSingle();
    if (sourceError) {
      console.error("[nutrition] Saved food source failed:", sourceError.message);
      return { status: "error", message: "That food couldn’t be updated." };
    }
    const source = sourceRow
      ? toNutritionEntryRecord(sourceRow as unknown as Record<string, unknown>)
      : null;
    if (!source) {
      return { status: "error", message: "That food couldn’t be found." };
    }

    const loaded = await loadSavedFoodDefinitions();
    if (loaded.status !== "ok") {
      return loaded;
    }
    const existing = findSavedFood(loaded.foods, {
      mealId: source.meal_id,
      name: entryDisplayTitle(source),
    });
    const aliases = savedFoodAliases(
      entryDisplayTitle(source),
      existing?.aliases ?? source.search_aliases,
      value.name,
    );
    const record = {
      name: value.name,
      search_aliases: aliases,
      serving_label: value.servingLabel,
      default_portions: value.defaultPortions,
      calories_per_portion: portions.calories,
      protein_g_per_portion: portions.proteinG,
      carbs_g_per_portion: portions.carbsG,
      fat_g_per_portion: portions.fatG,
      estimation_source: "user" as const,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { data, error } = await supabase
        .from("nutrition_meals")
        .update(record)
        .eq("user_id", user.id)
        .eq("id", existing.id)
        .select(SAVED_FOOD_SELECT)
        .single();
      if (error || !data) {
        console.error("[nutrition] Saved food update failed:", error?.message ?? "No row");
        return { status: "error", message: "That food couldn’t be updated." };
      }
      const food = savedFoodFromRow(data as unknown as Record<string, unknown>);
      if (!food) {
        return { status: "error", message: "That food couldn’t be updated." };
      }
      return { status: "ok", food };
    }

    const { data, error } = await supabase
      .from("nutrition_meals")
      .insert({
        ...record,
        user_id: user.id,
      })
      .select(SAVED_FOOD_SELECT)
      .single();
    if (error || !data) {
      console.error("[nutrition] Saved food create failed:", error?.message ?? "No row");
      return { status: "error", message: "That food couldn’t be updated." };
    }
    const food = savedFoodFromRow(data as unknown as Record<string, unknown>);
    if (!food) {
      return { status: "error", message: "That food couldn’t be updated." };
    }
    return { status: "ok", food };
  } catch (error) {
    console.error(
      "[nutrition] Saved food update failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return { status: "error", message: "That food couldn’t be updated." };
  }
}

export async function applySavedFoodsToEntries(
  entries: NutritionEntryRecord[],
): Promise<NutritionEntryRecord[]> {
  const loaded = await loadSavedFoodDefinitions();
  if (loaded.status !== "ok" || loaded.foods.length === 0) {
    return entries;
  }
  return overlaySavedFoods(entries, loaded.foods);
}
