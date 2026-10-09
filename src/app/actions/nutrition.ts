"use server";

import {
  GeminiProvider,
  isGeminiConfigured,
} from "@/lib/ai/providers/gemini";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ensureNutritionTargetsForUser,
  NUTRITION_ENTRY_SELECT,
  summariseNutritionDay,
  toNutritionEntryRecord,
} from "@/lib/nutrition-day";
import { shiftCoachDate } from "@/lib/coach";
import {
  buildSearchAliases,
  deriveDisplayName,
  entryMatchesQuery,
  normalizeFoodText,
} from "@/lib/food-naming";
import {
  fetchOpenFoodFactsProduct,
  isPlausibleBarcode,
  normalizeBarcode,
  type LookupBarcodeResult,
} from "@/lib/open-food-facts";
import {
  isMealTypeId,
  isNutritionEntryStatus,
  isValidLoggedDate,
  parseFoodEstimationResponse,
  type MealTypeId,
  type NutritionDaySummary,
  type NutritionEntryRecord,
  type NutritionEntryStatus,
  type NutritionEstimate,
} from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type ListNutritionResult =
  | { status: "ok"; entries: NutritionEntryRecord[] }
  | { status: "error"; message: string };

export type NutritionDayResult =
  | { status: "ok"; summary: NutritionDaySummary; recent: NutritionEntryRecord[] }
  | { status: "error"; message: string };

export type EstimateNutritionResult =
  | { status: "ok"; estimate: NutritionEstimate }
  | { status: "needs_clarification"; question: string }
  | { status: "error"; message: string };

export type SearchNutritionResult =
  | { status: "ok"; entries: NutritionEntryRecord[] }
  | { status: "error"; message: string };

export type UpdateNutritionResult =
  | { status: "updated"; entry: NutritionEntryRecord }
  | { status: "error"; message: string };

export type SaveNutritionResult =
  | { status: "saved"; entry: NutritionEntryRecord }
  | { status: "error"; message: string };

export type UpdateNutritionStatusResult =
  | { status: "updated"; entry: NutritionEntryRecord }
  | { status: "error"; message: string };

export type DeleteNutritionResult =
  | { status: "deleted" }
  | { status: "error"; message: string };

export type ListHabitPrefsResult =
  | { status: "ok"; stoppedKeys: string[] }
  | { status: "error"; message: string };

export type StopHabitResult =
  | { status: "stopped"; habitKey: string }
  | { status: "error"; message: string };

export async function listRecentNutritionEntries(
  limit = 20,
): Promise<ListNutritionResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so nutrition history can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 40));

    if (error) {
      console.error("[nutrition] List failed:", error.message);
      return {
        status: "error",
        message: "Nutrition history couldn’t be loaded. Try again.",
      };
    }

    const entries = (data ?? [])
      .map((row) =>
        toNutritionEntryRecord(row as unknown as Record<string, unknown>),
      )
      .filter((entry): entry is NutritionEntryRecord => entry !== null);

    return { status: "ok", entries };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition list error";
    console.error("[nutrition] List failed:", message);
    return {
      status: "error",
      message: "Nutrition history couldn’t be loaded. Try again.",
    };
  }
}

export async function loadNutritionDay(
  localDate: string,
): Promise<NutritionDayResult> {
  if (!isValidLoggedDate(localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so nutrition can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const ensured = await ensureNutritionTargetsForUser(supabase, user.id);

    const { data, error } = await supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      console.error("[nutrition] Day load failed:", error.message);
      return {
        status: "error",
        message: "Nutrition couldn’t be loaded. Try again.",
      };
    }

    const entries = (data ?? [])
      .map((row) =>
        toNutritionEntryRecord(row as unknown as Record<string, unknown>),
      )
      .filter((entry): entry is NutritionEntryRecord => entry !== null);

    const summary = summariseNutritionDay({
      localDate,
      targets: ensured.targets,
      targetsStatus: ensured.status,
      targetsMessage: ensured.message,
      entries,
    });

    return { status: "ok", summary, recent: entries };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition day error";
    console.error("[nutrition] Day load failed:", message);
    return {
      status: "error",
      message: "Nutrition couldn’t be loaded. Try again.",
    };
  }
}

export async function estimateNutritionFood(input: {
  description: string;
  clarificationAnswer?: string | null;
  skipClarification?: boolean;
}): Promise<EstimateNutritionResult> {
  const description = input.description.trim();
  if (!description) {
    return { status: "error", message: "Tell me what you’ve eaten." };
  }

  if (!isGeminiConfigured()) {
    return {
      status: "error",
      message:
        "Food estimation isn’t connected right now. Check GEMINI_API_KEY and try again.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const provider = new GeminiProvider();
    const { rawText } = await provider.estimateFoodNutrition({
      description,
      clarificationAnswer: input.clarificationAnswer,
      skipClarification: input.skipClarification,
    });
    const parsed = parseFoodEstimationResponse(rawText);
    if (parsed.kind === "clarification") {
      if (input.skipClarification || input.clarificationAnswer?.trim()) {
        return {
          status: "error",
          message: "That estimate couldn’t be finished. Try again.",
        };
      }
      return { status: "needs_clarification", question: parsed.question };
    }
    if (parsed.kind !== "estimate") {
      return {
        status: "error",
        message: "That estimate couldn’t be read. Try again.",
      };
    }
    return { status: "ok", estimate: parsed.estimate };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown estimate error";
    console.error("[nutrition] Estimate failed:", message);
    return {
      status: "error",
      message: "That food couldn’t be estimated. Try again.",
    };
  }
}

export async function searchRecentNutritionEntries(input: {
  query: string;
  localDate: string;
}): Promise<SearchNutritionResult> {
  const query = input.query.trim();
  if (query.length < 2) {
    return { status: "ok", entries: [] };
  }

  if (!isValidLoggedDate(input.localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so suggestions can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const fromDate = shiftCoachDate(input.localDate, -7);
  const normalizedQuery = normalizeFoodText(query);

  try {
    const supabase = await createClient();
    // Fetch the last 7 days without a SQL filter, then match client-side so
    // display names and aliases (not just the raw description) are searchable.
    const { data, error } = await supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .gte("logged_date", fromDate)
      .lte("logged_date", input.localDate)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[nutrition] Search failed:", error.message);
      return {
        status: "error",
        message: "Suggestions couldn’t be loaded.",
      };
    }

    type Ranked = { entry: NutritionEntryRecord; rank: number; order: number };
    const seen = new Map<string, number>();
    const ranked: Ranked[] = [];
    let order = 0;

    for (const row of data ?? []) {
      const entry = toNutritionEntryRecord(
        row as unknown as Record<string, unknown>,
      );
      if (!entry || !entryMatchesQuery(entry, query)) {
        continue;
      }

      // Lower rank = better match. Display name / alias beats raw description.
      const displayNorm = normalizeFoodText(entry.display_name ?? "");
      const aliasMatch = entry.search_aliases.some((alias) =>
        normalizeFoodText(alias).includes(normalizedQuery),
      );
      const rank = displayNorm.startsWith(normalizedQuery)
        ? 0
        : displayNorm.includes(normalizedQuery)
          ? 1
          : aliasMatch
            ? 2
            : 3;

      const key = `${displayNorm}|${normalizeFoodText(entry.description)}`;
      const existingIndex = seen.get(key);
      if (existingIndex !== undefined) {
        // Prefer a duplicate that still has saved macros for structured re-logging.
        const existing = ranked[existingIndex];
        if (
          existing.entry.calories_estimated == null &&
          entry.calories_estimated != null
        ) {
          ranked[existingIndex] = { entry, rank, order: existing.order };
        }
        continue;
      }
      seen.set(key, ranked.length);
      ranked.push({ entry, rank, order: order++ });
    }

    ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
    const entries = ranked.slice(0, 6).map((item) => item.entry);

    return { status: "ok", entries };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition search error";
    console.error("[nutrition] Search failed:", message);
    return {
      status: "error",
      message: "Suggestions couldn’t be loaded.",
    };
  }
}

export async function updateNutritionEntry(input: {
  entryId: string;
  description: string;
  /** When set, renames the diary title without requiring a description change. */
  displayName?: string | null;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): Promise<UpdateNutritionResult> {
  const description = input.description.trim();
  if (!description) {
    return { status: "error", message: "Add a short food description." };
  }

  const calories = Math.round(input.calories);
  const proteinG = Math.round(input.proteinG);
  const carbsG = Math.round(input.carbsG);
  const fatG = Math.round(input.fatG);

  if (
    ![calories, proteinG, carbsG, fatG].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  ) {
    return { status: "error", message: "Nutrition values must be zero or more." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be updated.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();

    const { data: existing, error: existingError } = await supabase
      .from("nutrition_entries")
      .select("description, display_name, brand")
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError || !existing) {
      console.error(
        "[nutrition] Update lookup failed:",
        existingError?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    // Prefer an explicit rename. Otherwise keep the existing display name when
    // only macros/ingredients change, so nutrition edits don't wipe titles.
    const brand =
      typeof existing.brand === "string" && existing.brand.trim()
        ? existing.brand.trim()
        : null;
    const explicitName = input.displayName?.trim();
    const existingName =
      typeof existing.display_name === "string" && existing.display_name.trim()
        ? existing.display_name.trim()
        : null;
    const displayName = explicitName
      ? deriveDisplayName(description, explicitName)
      : existingName ?? deriveDisplayName(description);

    const { data, error } = await supabase
      .from("nutrition_entries")
      .update({
        description,
        display_name: displayName,
        search_aliases: buildSearchAliases({ displayName, description, brand }),
        calories_estimated: calories,
        protein_g_estimated: proteinG,
        carbs_g_estimated: carbsG,
        fat_g_estimated: fatG,
        estimation_source: "user",
        estimation_confidence: null,
      })
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .select(NUTRITION_ENTRY_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[nutrition] Update failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    const entry = toNutritionEntryRecord(
      data as unknown as Record<string, unknown>,
    );
    if (!entry) {
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    return { status: "updated", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition update error";
    console.error("[nutrition] Update failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be updated. Try again.",
    };
  }
}

export async function saveNutritionEntry(input: {
  loggedDate: string;
  description: string;
  mealType: MealTypeId | null;
  status: NutritionEntryStatus;
  estimate: NutritionEstimate | null;
  /** Optional Open Food Facts product metadata. */
  barcode?: string | null;
  brand?: string | null;
}): Promise<SaveNutritionResult> {
  if (!isValidLoggedDate(input.loggedDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const description = input.description.trim();
  if (!description) {
    return { status: "error", message: "Tell me what you’ve eaten." };
  }

  if (input.mealType !== null && !isMealTypeId(input.mealType)) {
    return { status: "error", message: "That meal type isn’t valid." };
  }

  if (!isNutritionEntryStatus(input.status)) {
    return { status: "error", message: "That meal status isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const estimate = input.estimate;

    const barcodeDigits = input.barcode ? normalizeBarcode(input.barcode) : "";
    const barcode = isPlausibleBarcode(barcodeDigits) ? barcodeDigits : null;
    const brand = input.brand?.trim().slice(0, 80) || null;
    const displayName = deriveDisplayName(description, estimate?.displayName);
    const searchAliases = buildSearchAliases({
      displayName,
      description,
      brand,
      extra: estimate?.searchAliases,
    });

    const { data, error } = await supabase
      .from("nutrition_entries")
      .insert({
        user_id: user.id,
        logged_date: input.loggedDate,
        meal_type: input.mealType,
        description,
        display_name: displayName,
        search_aliases: searchAliases,
        barcode,
        brand,
        status: input.status,
        calories_estimated: estimate?.calories ?? null,
        protein_g_estimated: estimate?.proteinG ?? null,
        carbs_g_estimated: estimate?.carbsG ?? null,
        fat_g_estimated: estimate?.fatG ?? null,
        estimation_confidence: estimate?.confidence ?? null,
        estimation_source: estimate?.source ?? (estimate ? "gemini" : "none"),
      })
      .select(NUTRITION_ENTRY_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[nutrition] Save failed:",
        error?.message ?? "No row returned",
      );
      return {
        status: "error",
        message: "That entry couldn’t be saved. Try again.",
      };
    }

    const entry = toNutritionEntryRecord(
      data as unknown as Record<string, unknown>,
    );
    if (!entry) {
      return {
        status: "error",
        message: "That entry couldn’t be saved. Try again.",
      };
    }

    return { status: "saved", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition save error";
    console.error("[nutrition] Save failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be saved. Try again.",
    };
  }
}

export async function markNutritionEntryEaten(input: {
  entryId: string;
}): Promise<UpdateNutritionStatusResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be updated.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nutrition_entries")
      .update({ status: "eaten" })
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .select(NUTRITION_ENTRY_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[nutrition] Mark eaten failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    const entry = toNutritionEntryRecord(
      data as unknown as Record<string, unknown>,
    );
    if (!entry) {
      return {
        status: "error",
        message: "That entry couldn’t be updated. Try again.",
      };
    }

    return { status: "updated", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition update error";
    console.error("[nutrition] Mark eaten failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be updated. Try again.",
    };
  }
}

export async function deleteNutritionEntry(input: {
  entryId: string;
}): Promise<DeleteNutritionResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that entry couldn’t be deleted.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("nutrition_entries")
      .delete()
      .eq("id", input.entryId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[nutrition] Delete failed:", error.message);
      return {
        status: "error",
        message: "That entry couldn’t be deleted. Try again.",
      };
    }

    return { status: "deleted" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown nutrition delete error";
    console.error("[nutrition] Delete failed:", message);
    return {
      status: "error",
      message: "That entry couldn’t be deleted. Try again.",
    };
  }
}

export async function lookupBarcodeProduct(input: {
  barcode: string;
}): Promise<LookupBarcodeResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  return fetchOpenFoodFactsProduct(input.barcode);
}

export async function listNutritionHabitPrefs(): Promise<ListHabitPrefsResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so habit preferences can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nutrition_habit_prefs")
      .select("habit_key")
      .eq("user_id", user.id)
      .eq("status", "stopped");

    if (error) {
      console.error("[nutrition] Habit prefs list failed:", error.message);
      return {
        status: "error",
        message: "Habit preferences couldn’t be loaded.",
      };
    }

    const stoppedKeys = (data ?? [])
      .map((row) => (row as { habit_key?: unknown }).habit_key)
      .filter((key): key is string => typeof key === "string");

    return { status: "ok", stoppedKeys };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown habit prefs error";
    console.error("[nutrition] Habit prefs list failed:", message);
    return {
      status: "error",
      message: "Habit preferences couldn’t be loaded.",
    };
  }
}

export async function stopNutritionHabit(input: {
  habitKey: string;
}): Promise<StopHabitResult> {
  const habitKey = input.habitKey.trim();
  if (!habitKey || habitKey.length > 120) {
    return { status: "error", message: "That habit isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so that preference couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("nutrition_habit_prefs").upsert(
      {
        user_id: user.id,
        habit_key: habitKey,
        status: "stopped",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,habit_key" },
    );

    if (error) {
      console.error("[nutrition] Stop habit failed:", error.message);
      return {
        status: "error",
        message: "That preference couldn’t be saved. Try again.",
      };
    }

    return { status: "stopped", habitKey };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown stop habit error";
    console.error("[nutrition] Stop habit failed:", message);
    return {
      status: "error",
      message: "That preference couldn’t be saved. Try again.",
    };
  }
}
