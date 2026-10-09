"use server";

import { loadTodaysCheckIn } from "@/app/actions/check-in";
import { loadNutritionDay } from "@/app/actions/nutrition";
import { getCurrentUser } from "@/lib/auth/session";
import type { CompletedDailyCheckIn } from "@/lib/check-ins";
import { isValidCheckInDate } from "@/lib/check-ins";
import { listNutritionHabitPrefs } from "@/app/actions/nutrition";
import type { HabitHistoryEntry } from "@/lib/food-habits";
import type { MealTypeId, NutritionDaySummary } from "@/lib/nutrition";
import { isValidLoggedDate } from "@/lib/nutrition";
import { shiftCoachDate } from "@/lib/coach";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isTrainingIntensityId,
  isTrainingTypeId,
  isValidSessionDate,
  type TrainingSessionRecord,
} from "@/lib/training";
import type { PlanId } from "@/lib/today";
import { NUTRITION_ENTRY_SELECT, toNutritionEntryRecord } from "@/lib/nutrition-day";

const SESSION_SELECT =
  "id, session_date, training_type, title, duration_minutes, notes, intensity, calories_burned, created_at";

export type TodayDashboardData = {
  localDate: string;
  hasCheckIn: boolean;
  checkIn: CompletedDailyCheckIn | null;
  coachTake: string | null;
  plannedTraining: PlanId | null;
  nutrition: NutritionDaySummary | null;
  loggedMealTypes: Array<MealTypeId | null>;
  trainingSession: TrainingSessionRecord | null;
  hasTrainingSession: boolean;
  /** Recent nutrition history for habit detection (excludes today). */
  habitHistory: HabitHistoryEntry[];
  stoppedHabitKeys: string[];
};

export type LoadTodayDashboardResult =
  | { status: "ok"; data: TodayDashboardData }
  | { status: "error"; message: string };

function toSessionRecord(
  row: Record<string, unknown>,
): TrainingSessionRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.session_date !== "string" ||
    !isTrainingTypeId(row.training_type) ||
    typeof row.title !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  const duration =
    row.duration_minutes === null || row.duration_minutes === undefined
      ? null
      : Number(row.duration_minutes);

  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    return null;
  }

  const calories =
    row.calories_burned === null || row.calories_burned === undefined
      ? null
      : Number(row.calories_burned);

  return {
    id: row.id,
    session_date: row.session_date,
    training_type: row.training_type,
    title: row.title,
    duration_minutes: duration,
    notes: typeof row.notes === "string" ? row.notes : null,
    intensity: isTrainingIntensityId(row.intensity) ? row.intensity : null,
    calories_burned:
      calories != null && Number.isFinite(calories) && calories >= 0
        ? Math.round(calories)
        : null,
    created_at: row.created_at,
  };
}

/**
 * Loads Today dashboard inputs. Next-action is resolved on the client with
 * the device's local clock so time-of-day stays accurate.
 */
export async function loadTodayDashboard(
  localDate: string,
): Promise<LoadTodayDashboardResult> {
  if (
    !isValidCheckInDate(localDate) ||
    !isValidLoggedDate(localDate) ||
    !isValidSessionDate(localDate)
  ) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so Today can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const habitFrom = shiftCoachDate(localDate, -14);

    const [checkInResult, nutritionResult, trainingResult, habitPrefsResult, habitHistoryResult] =
      await Promise.all([
        loadTodaysCheckIn(localDate),
        loadNutritionDay(localDate),
        supabase
          .from("training_sessions")
          .select(SESSION_SELECT)
          .eq("user_id", user.id)
          .eq("session_date", localDate)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        listNutritionHabitPrefs(),
        supabase
          .from("nutrition_entries")
          .select(NUTRITION_ENTRY_SELECT)
          .eq("user_id", user.id)
          .gte("logged_date", habitFrom)
          .lt("logged_date", localDate)
          .order("logged_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(120),
      ]);

    if (checkInResult.status === "error") {
      return { status: "error", message: checkInResult.message };
    }

    if (nutritionResult.status === "error") {
      return { status: "error", message: nutritionResult.message };
    }

    if (trainingResult.error) {
      console.error(
        "[today-dashboard] Training load failed:",
        trainingResult.error.message,
      );
      return {
        status: "error",
        message: "Today couldn’t be loaded. Try again.",
      };
    }

    if (habitHistoryResult.error) {
      console.error(
        "[today-dashboard] Habit history load failed:",
        habitHistoryResult.error.message,
      );
      // Non-fatal — Coach Moments still work without habit history.
    }

    const nutrition = nutritionResult.summary;
    // Planned + eaten both count as "logged" so Coach doesn't re-ask.
    const loggedMealTypes = [
      ...nutrition.eatenEntries,
      ...nutrition.plannedEntries,
    ].map((entry) => entry.meal_type);

    const trainingSession = trainingResult.data
      ? toSessionRecord(trainingResult.data as Record<string, unknown>)
      : null;

    const checkIn =
      checkInResult.status === "found" ? checkInResult.checkIn : null;

    const habitHistory: HabitHistoryEntry[] = [];
    for (const row of habitHistoryResult.data ?? []) {
      const entry = toNutritionEntryRecord(
        row as unknown as Record<string, unknown>,
      );
      if (!entry) {
        continue;
      }
      habitHistory.push({
        logged_date: entry.logged_date,
        description: entry.description,
        display_name: entry.display_name,
        search_aliases: entry.search_aliases,
        meal_type: entry.meal_type,
        calories_estimated: entry.calories_estimated,
        protein_g_estimated: entry.protein_g_estimated,
        carbs_g_estimated: entry.carbs_g_estimated,
        fat_g_estimated: entry.fat_g_estimated,
        created_at: entry.created_at,
      });
    }

    const stoppedHabitKeys =
      habitPrefsResult.status === "ok" ? habitPrefsResult.stoppedKeys : [];

    return {
      status: "ok",
      data: {
        localDate,
        hasCheckIn: checkInResult.status === "found",
        checkIn,
        coachTake:
          checkInResult.status === "found" ? checkInResult.coachTake : null,
        plannedTraining: checkIn?.plan ?? null,
        nutrition,
        loggedMealTypes,
        trainingSession,
        hasTrainingSession: trainingSession !== null,
        habitHistory,
        stoppedHabitKeys,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown today dashboard error";
    console.error("[today-dashboard] Load failed:", message);
    return {
      status: "error",
      message: "Today couldn’t be loaded. Try again.",
    };
  }
}
