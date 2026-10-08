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
  const pattern = `%${query.replace(/[%_]/g, "").slice(0, 60)}%`;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("nutrition_entries")
      .select(NUTRITION_ENTRY_SELECT)
      .eq("user_id", user.id)
      .gte("logged_date", fromDate)
      .lte("logged_date", input.localDate)
      .ilike("description", pattern)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[nutrition] Search failed:", error.message);
      return {
        status: "error",
        message: "Suggestions couldn’t be loaded.",
      };
    }

    const seen = new Set<string>();
    const entries: NutritionEntryRecord[] = [];
    for (const row of data ?? []) {
      const entry = toNutritionEntryRecord(
        row as unknown as Record<string, unknown>,
      );
      if (!entry) {
        continue;
      }
      const key = entry.description.trim().toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      entries.push(entry);
      if (entries.length >= 6) {
        break;
      }
    }

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
    const { data, error } = await supabase
      .from("nutrition_entries")
      .update({
        description,
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
    const { data, error } = await supabase
      .from("nutrition_entries")
      .insert({
        user_id: user.id,
        logged_date: input.loggedDate,
        meal_type: input.mealType,
        description,
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
