"use server";

import { getCurrentUser } from "@/lib/auth/session";
import {
  NUTRITION_ENTRY_SELECT,
  toNutritionEntryRecord,
} from "@/lib/nutrition-day";
import { isValidLoggedDate, type NutritionEntryRecord } from "@/lib/nutrition";
import {
  entriesNotAlreadyLogged,
  yesterdayLoggedDate,
} from "@/lib/nutrition-usuals";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type QuickMealContext = {
  history: NutritionEntryRecord[];
  yesterday: NutritionEntryRecord[];
  yesterdayDate: string;
};

function rowsToEntries(data: unknown[] | null): NutritionEntryRecord[] {
  return (data ?? [])
    .map((row) => toNutritionEntryRecord(row as Record<string, unknown>))
    .filter((entry): entry is NutritionEntryRecord => entry !== null);
}

export async function loadQuickMealContext(loggedDate: string): Promise<
  | { status: "ok"; context: QuickMealContext }
  | { status: "error"; message: string }
> {
  if (!isValidLoggedDate(loggedDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const yesterdayDate = yesterdayLoggedDate(loggedDate);
  try {
    const supabase = await createClient();
    const [historyResult, yesterdayResult] = await Promise.all([
      supabase
        .from("nutrition_entries")
        .select(NUTRITION_ENTRY_SELECT)
        .eq("user_id", user.id)
        .order("logged_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("nutrition_entries")
        .select(NUTRITION_ENTRY_SELECT)
        .eq("user_id", user.id)
        .eq("logged_date", yesterdayDate)
        .order("created_at", { ascending: true }),
    ]);
    if (historyResult.error || yesterdayResult.error) {
      console.error(
        "[nutrition] Quick log load failed:",
        historyResult.error?.message ?? yesterdayResult.error?.message,
      );
      return { status: "error", message: "Saved foods couldn’t be loaded." };
    }
    return {
      status: "ok",
      context: {
        history: rowsToEntries(historyResult.data),
        yesterday: rowsToEntries(yesterdayResult.data),
        yesterdayDate,
      },
    };
  } catch (error) {
    console.error(
      "[nutrition] Quick log load failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return { status: "error", message: "Saved foods couldn’t be loaded." };
  }
}

export async function copyNutritionEntriesToDate(input: {
  loggedDate: string;
  sourceEntryIds: string[];
  /** Repeat yesterday keeps planned meals planned. Quick adds are eaten. */
  preserveStatus?: boolean;
}): Promise<
  | { status: "ok"; added: number; skipped: number }
  | { status: "error"; message: string }
> {
  if (!isValidLoggedDate(input.loggedDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }
  const sourceIds = [...new Set(input.sourceEntryIds.filter((id) => id.trim()))].slice(0, 40);
  if (sourceIds.length === 0) {
    return { status: "error", message: "Choose at least one food." };
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
    const [sourcesResult, existingResult] = await Promise.all([
      supabase
        .from("nutrition_entries")
        .select(NUTRITION_ENTRY_SELECT)
        .eq("user_id", user.id)
        .in("id", sourceIds),
      supabase
        .from("nutrition_entries")
        .select(NUTRITION_ENTRY_SELECT)
        .eq("user_id", user.id)
        .eq("logged_date", input.loggedDate),
    ]);
    if (sourcesResult.error || existingResult.error) {
      console.error(
        "[nutrition] Quick copy failed:",
        sourcesResult.error?.message ?? existingResult.error?.message,
      );
      return { status: "error", message: "Those foods couldn’t be added." };
    }

    const sources = rowsToEntries(sourcesResult.data);
    const existing = rowsToEntries(existingResult.data);
    const toCopy = entriesNotAlreadyLogged(sources, existing);
    const skipped = sourceIds.length - toCopy.length;
    if (toCopy.length === 0) {
      return { status: "ok", added: 0, skipped: sourceIds.length };
    }

    const { error } = await supabase.from("nutrition_entries").insert(
      toCopy.map((entry) => ({
        user_id: user.id,
        logged_date: input.loggedDate,
        meal_type: entry.meal_type,
        description: entry.description,
        display_name: entry.display_name,
        search_aliases: entry.search_aliases,
        barcode: entry.barcode,
        brand: entry.brand,
        status: input.preserveStatus ? entry.status : ("eaten" as const),
        calories_estimated: entry.calories_estimated,
        protein_g_estimated: entry.protein_g_estimated,
        carbs_g_estimated: entry.carbs_g_estimated,
        fat_g_estimated: entry.fat_g_estimated,
        estimation_confidence: entry.estimation_confidence,
        estimation_source: entry.estimation_source,
        meal_id: entry.meal_id,
        portions: entry.portions,
      })),
    );
    if (error) {
      console.error("[nutrition] Quick copy insert failed:", error.message);
      return { status: "error", message: "Those foods couldn’t be added." };
    }
    return { status: "ok", added: toCopy.length, skipped: Math.max(0, skipped) };
  } catch (error) {
    console.error(
      "[nutrition] Quick copy failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return { status: "error", message: "Those foods couldn’t be added." };
  }
}
