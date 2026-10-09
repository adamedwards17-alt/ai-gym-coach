"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getLocalLoggedDate } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  buildWeeklyTrainingProgress,
  startOfWeekMonday,
  endOfWeekSunday,
} from "@/lib/training-week";
import {
  formatWeightTrend,
  latestWeightKg,
  weightTrendKg,
  type WeightMeasurementRecord,
} from "@/lib/weight-measurements";
import { weekStartForLocalDate } from "@/lib/weekly-check-ins";
import type {
  TrainingPlanEntryRecord,
  TrainingSessionRecord,
} from "@/lib/training";

export type ProgressDashboardData = {
  localDate: string;
  primaryGoal: string | null;
  goalOwnWords: string | null;
  goalStartedAt: string | null;
  targetWeightKg: number | null;
  targetDate: string | null;
  currentWeightKg: number | null;
  weightTrendLabel: string | null;
  measurements: WeightMeasurementRecord[];
  weekProgress: ReturnType<typeof buildWeeklyTrainingProgress> | null;
  weeklyCheckInDue: boolean;
  latestWeeklySummary: string | null;
  nutritionTargets: {
    dailyCalories: number;
    proteinG: number;
    isManual: boolean;
  } | null;
};

export async function loadProgressDashboard(): Promise<
  | { status: "ok"; data: ProgressDashboardData }
  | { status: "error"; message: string }
> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const today = getLocalLoggedDate();
    const weekStart = startOfWeekMonday(today);
    const weekEnd = endOfWeekSunday(today);
    const thisWeekStart = weekStartForLocalDate(today);

    const [
      profileResult,
      weightsResult,
      planResult,
      sessionResult,
      targetsResult,
      checkInResult,
      completedCheckInResult,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "primary_goal, goal_in_own_words, goal_started_at, target_weight_kg, target_date, weight_kg, weekly_session_target",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("weight_measurements")
        .select("id, measured_on, weight_kg, source, notes, created_at")
        .eq("user_id", user.id)
        .order("measured_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("training_plan_entries")
        .select(
          "id, plan_date, training_type, title, focus, planned_duration_minutes, status, training_session_id, original_plan_date, skip_reason, skip_notes, sort_order, rescheduled_from_id, created_at",
        )
        .eq("user_id", user.id)
        .gte("plan_date", weekStart)
        .lte("plan_date", weekEnd),
      supabase
        .from("training_sessions")
        .select(
          "id, session_date, training_type, title, duration_minutes, notes, intensity, calories_burned, strength_details, created_at",
        )
        .eq("user_id", user.id)
        .gte("session_date", weekStart)
        .lte("session_date", weekEnd),
      supabase
        .from("nutrition_targets")
        .select("daily_calories, protein_g, is_manual")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("weekly_check_ins")
        .select("week_start_date, status, recommendation_text")
        .eq("user_id", user.id)
        .eq("week_start_date", thisWeekStart)
        .maybeSingle(),
      supabase
        .from("weekly_check_ins")
        .select("week_start_date, recommendation_text, status")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("week_start_date", { ascending: false })
        .limit(1),
    ]);

    const measurements: WeightMeasurementRecord[] = (weightsResult.data ?? [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        if (
          typeof r.id !== "string" ||
          typeof r.measured_on !== "string" ||
          typeof r.created_at !== "string"
        ) {
          return null;
        }
        return {
          id: r.id,
          measured_on: r.measured_on,
          weight_kg: Number(r.weight_kg),
          source: (r.source as WeightMeasurementRecord["source"]) ?? "manual",
          notes: typeof r.notes === "string" ? r.notes : null,
          created_at: r.created_at,
        };
      })
      .filter((m): m is WeightMeasurementRecord => m !== null);

    const planEntries = (planResult.data ?? []) as unknown as TrainingPlanEntryRecord[];
    const sessions = (sessionResult.data ?? []) as unknown as TrainingSessionRecord[];

    const target =
      typeof profileResult.data?.weekly_session_target === "number"
        ? profileResult.data.weekly_session_target
        : 3;

    const weekProgress = buildWeeklyTrainingProgress({
      localDate: today,
      today,
      target,
      planEntries,
      sessions,
    });

    const thisWeekCheckIn = checkInResult.data as
      | { status?: string; recommendation_text?: string }
      | null;
    const latestCompleted = completedCheckInResult.data?.[0] as
      | { week_start_date?: string; recommendation_text?: string }
      | undefined;

    const weeklyCheckInDue =
      !thisWeekCheckIn || thisWeekCheckIn.status !== "completed";

    return {
      status: "ok",
      data: {
        localDate: today,
        primaryGoal:
          typeof profileResult.data?.primary_goal === "string"
            ? profileResult.data.primary_goal
            : null,
        goalOwnWords:
          typeof profileResult.data?.goal_in_own_words === "string"
            ? profileResult.data.goal_in_own_words
            : null,
        goalStartedAt:
          typeof profileResult.data?.goal_started_at === "string"
            ? profileResult.data.goal_started_at
            : null,
        targetWeightKg:
          typeof profileResult.data?.target_weight_kg === "number"
            ? Number(profileResult.data.target_weight_kg)
            : null,
        targetDate:
          typeof profileResult.data?.target_date === "string"
            ? profileResult.data.target_date
            : null,
        currentWeightKg:
          latestWeightKg(measurements) ??
          (typeof profileResult.data?.weight_kg === "number"
            ? Number(profileResult.data.weight_kg)
            : null),
        weightTrendLabel: formatWeightTrend(
          weightTrendKg(measurements, today),
        ),
        measurements,
        weekProgress,
        weeklyCheckInDue,
        latestWeeklySummary:
          (typeof thisWeekCheckIn?.recommendation_text === "string"
            ? thisWeekCheckIn.recommendation_text
            : null) ??
          (typeof latestCompleted?.recommendation_text === "string"
            ? latestCompleted.recommendation_text
            : null),
        nutritionTargets:
          targetsResult.data &&
          typeof targetsResult.data.daily_calories === "number"
            ? {
                dailyCalories: targetsResult.data.daily_calories,
                proteinG:
                  typeof targetsResult.data.protein_g === "number"
                    ? targetsResult.data.protein_g
                    : 0,
                isManual: targetsResult.data.is_manual === true,
              }
            : null,
      },
    };
  } catch (error) {
    console.error("[progress] Load failed:", error);
    return { status: "error", message: "Progress couldn’t be loaded." };
  }
}
