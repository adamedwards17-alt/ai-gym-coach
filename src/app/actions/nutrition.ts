"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isMealTypeId,
  isValidLoggedDate,
  type MealTypeId,
  type NutritionEntryRecord,
} from "@/lib/nutrition";

export type ListNutritionResult =
  | { status: "ok"; entries: NutritionEntryRecord[] }
  | { status: "error"; message: string };

export type SaveNutritionResult =
  | { status: "saved"; entry: NutritionEntryRecord }
  | { status: "error"; message: string };

const ENTRY_SELECT =
  "id, logged_date, meal_type, description, created_at";

function toEntryRecord(
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

  if (row.meal_type !== null && row.meal_type !== undefined && mealType === null) {
    return null;
  }

  return {
    id: row.id,
    logged_date: row.logged_date,
    meal_type: mealType,
    description: row.description,
    created_at: row.created_at,
  };
}

export async function listRecentNutritionEntries(
  limit = 12,
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
      .select(ENTRY_SELECT)
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
      .map((row) => toEntryRecord(row as Record<string, unknown>))
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

export async function saveNutritionEntry(input: {
  loggedDate: string;
  description: string;
  mealType: MealTypeId | null;
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
    const { data, error } = await supabase
      .from("nutrition_entries")
      .insert({
        user_id: user.id,
        logged_date: input.loggedDate,
        meal_type: input.mealType,
        description,
      })
      .select(ENTRY_SELECT)
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

    const entry = toEntryRecord(data as Record<string, unknown>);
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
