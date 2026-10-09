"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { daysBetweenLocalDates } from "@/lib/goal-history";
import { getLocalLoggedDate } from "@/lib/nutrition";
import { applyNutritionTargetsForUser } from "@/lib/nutrition-day";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  buildWeeklyRecommendation,
  weekStartForLocalDate,
  type AdherenceLevel,
  type RecoveryFeeling,
  type WeeklyCheckInRecord,
  type WeeklyRecommendationKind,
} from "@/lib/weekly-check-ins";
import { weightTrendKg } from "@/lib/weight-measurements";
import { logWeightMeasurement } from "@/app/actions/weight";

export type WeeklyCheckInBundle = {
  checkIn: WeeklyCheckInRecord | null;
  weekStart: string;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
  weightTrendKg: number | null;
  weighInCountLast14Days: number;
  currentCalories: number | null;
  currentProteinG: number | null;
  currentCarbsG: number | null;
  currentFatG: number | null;
  primaryGoal: string | null;
  daysOnPlan: number;
  isDue: boolean;
};

function toCheckIn(row: Record<string, unknown>): WeeklyCheckInRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.week_start_date !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  const status = row.status === "completed" ? "completed" : "in_progress";
  return {
    id: row.id,
    week_start_date: row.week_start_date,
    status,
    weight_kg:
      typeof row.weight_kg === "number" ? Number(row.weight_kg) : null,
    weight_confirmed: row.weight_confirmed === true,
    hunger_rating:
      typeof row.hunger_rating === "number" ? row.hunger_rating : null,
    energy_rating:
      typeof row.energy_rating === "number" ? row.energy_rating : null,
    mood_rating: typeof row.mood_rating === "number" ? row.mood_rating : null,
    nutrition_adherence: (row.nutrition_adherence as AdherenceLevel) ?? null,
    training_adherence: (row.training_adherence as AdherenceLevel) ?? null,
    recovery_feeling: (row.recovery_feeling as RecoveryFeeling) ?? null,
    context_notes:
      typeof row.context_notes === "string" ? row.context_notes : null,
    context_tags: Array.isArray(row.context_tags)
      ? row.context_tags.filter((t): t is string => typeof t === "string")
      : [],
    coach_summary:
      typeof row.coach_summary === "string" ? row.coach_summary : null,
    recommendation_kind:
      (row.recommendation_kind as WeeklyRecommendationKind) ?? null,
    recommendation_text:
      typeof row.recommendation_text === "string"
        ? row.recommendation_text
        : null,
    proposal_status:
      row.proposal_status === "pending" ||
      row.proposal_status === "accepted" ||
      row.proposal_status === "rejected" ||
      row.proposal_status === "none"
        ? row.proposal_status
        : null,
    proposed_daily_calories:
      typeof row.proposed_daily_calories === "number"
        ? row.proposed_daily_calories
        : null,
    proposed_protein_g:
      typeof row.proposed_protein_g === "number"
        ? row.proposed_protein_g
        : null,
    proposed_carbs_g:
      typeof row.proposed_carbs_g === "number" ? row.proposed_carbs_g : null,
    proposed_fat_g:
      typeof row.proposed_fat_g === "number" ? row.proposed_fat_g : null,
    completed_at:
      typeof row.completed_at === "string" ? row.completed_at : null,
    created_at: row.created_at,
  };
}

const CHECK_IN_SELECT =
  "id, week_start_date, status, weight_kg, weight_confirmed, hunger_rating, energy_rating, mood_rating, nutrition_adherence, training_adherence, recovery_feeling, context_notes, context_tags, coach_summary, recommendation_kind, recommendation_text, proposal_status, proposed_daily_calories, proposed_protein_g, proposed_carbs_g, proposed_fat_g, completed_at, created_at";

export async function loadWeeklyCheckInBundle(): Promise<
  | { status: "ok"; data: WeeklyCheckInBundle }
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
    const weekStart = weekStartForLocalDate(today);

    const [
      checkInResult,
      completedResult,
      profileResult,
      targetsResult,
      weightsResult,
    ] = await Promise.all([
      supabase
        .from("weekly_check_ins")
        .select(CHECK_IN_SELECT)
        .eq("user_id", user.id)
        .eq("week_start_date", weekStart)
        .maybeSingle(),
      supabase
        .from("weekly_check_ins")
        .select("week_start_date")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("week_start_date", { ascending: false })
        .limit(1),
      supabase
        .from("profiles")
        .select("primary_goal, goal_started_at, weight_kg")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("nutrition_targets")
        .select("daily_calories, protein_g, carbs_g, fat_g")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("weight_measurements")
        .select("id, measured_on, weight_kg, source, notes, created_at")
        .eq("user_id", user.id)
        .order("measured_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const checkIn = checkInResult.data
      ? toCheckIn(checkInResult.data as Record<string, unknown>)
      : null;

    const latestCompleted =
      completedResult.data?.[0] &&
      typeof completedResult.data[0].week_start_date === "string"
        ? completedResult.data[0].week_start_date
        : null;

    const measurements = (weightsResult.data ?? []).map((row) => ({
      id: String((row as { id: string }).id),
      measured_on: String((row as { measured_on: string }).measured_on),
      weight_kg: Number((row as { weight_kg: number }).weight_kg),
      source: "manual" as const,
      notes: null,
      created_at: String((row as { created_at: string }).created_at),
    }));

    const latest = measurements[0] ?? null;
    const fourteenDaysAgo = (() => {
      const [y, m, d] = today.split("-").map(Number);
      const date = new Date(y, m - 1, d - 14);
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    })();

    const weighInCountLast14Days = measurements.filter(
      (m) => m.measured_on >= fourteenDaysAgo,
    ).length;

    const goalStarted =
      typeof profileResult.data?.goal_started_at === "string"
        ? profileResult.data.goal_started_at
        : null;

    const isDue =
      !checkIn || checkIn.status !== "completed"
        ? !latestCompleted || latestCompleted < weekStart
        : false;

    return {
      status: "ok",
      data: {
        checkIn,
        weekStart,
        latestWeightKg: latest?.weight_kg ??
          (typeof profileResult.data?.weight_kg === "number"
            ? Number(profileResult.data.weight_kg)
            : null),
        latestWeightDate: latest?.measured_on ?? null,
        weightTrendKg: weightTrendKg(measurements, today),
        weighInCountLast14Days,
        currentCalories:
          typeof targetsResult.data?.daily_calories === "number"
            ? targetsResult.data.daily_calories
            : null,
        currentProteinG:
          typeof targetsResult.data?.protein_g === "number"
            ? targetsResult.data.protein_g
            : null,
        currentCarbsG:
          typeof targetsResult.data?.carbs_g === "number"
            ? targetsResult.data.carbs_g
            : null,
        currentFatG:
          typeof targetsResult.data?.fat_g === "number"
            ? targetsResult.data.fat_g
            : null,
        primaryGoal:
          typeof profileResult.data?.primary_goal === "string"
            ? profileResult.data.primary_goal
            : null,
        daysOnPlan: goalStarted
          ? daysBetweenLocalDates(goalStarted, today)
          : 0,
        isDue,
      },
    };
  } catch (error) {
    console.error("[weekly-check-in] Load failed:", error);
    return { status: "error", message: "Weekly check-in couldn’t be loaded." };
  }
}

export async function saveWeeklyCheckInDraft(input: {
  checkInId?: string | null;
  weekStart: string;
  weightKg?: number | null;
  weightConfirmed?: boolean;
  hungerRating?: number | null;
  energyRating?: number | null;
  moodRating?: number | null;
  nutritionAdherence?: AdherenceLevel | null;
  trainingAdherence?: AdherenceLevel | null;
  recoveryFeeling?: RecoveryFeeling | null;
  contextNotes?: string | null;
  contextTags?: string[];
  complete?: boolean;
}): Promise<
  | { status: "saved"; checkIn: WeeklyCheckInRecord }
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
    const bundle = await loadWeeklyCheckInBundle();
    if (bundle.status !== "ok") {
      return { status: "error", message: bundle.message };
    }

    let recommendation = null as ReturnType<
      typeof buildWeeklyRecommendation
    > | null;
    if (input.complete) {
      recommendation = buildWeeklyRecommendation({
        primaryGoal: bundle.data.primaryGoal,
        daysOnPlan: bundle.data.daysOnPlan,
        weighInCountLast14Days: bundle.data.weighInCountLast14Days,
        weightTrendKg: bundle.data.weightTrendKg,
        currentCalories: bundle.data.currentCalories,
        hunger: input.hungerRating ?? null,
        energy: input.energyRating ?? null,
        nutritionAdherence: input.nutritionAdherence ?? null,
        trainingAdherence: input.trainingAdherence ?? null,
        recovery: input.recoveryFeeling ?? null,
      });
    }

    if (
      input.weightKg != null &&
      Number.isFinite(input.weightKg) &&
      input.weightConfirmed
    ) {
      await logWeightMeasurement({
        weightKg: input.weightKg,
        measuredOn: today,
        source: "weekly_checkin",
      });
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      week_start_date: input.weekStart,
      status: input.complete ? "completed" : "in_progress",
      weight_kg: input.weightKg ?? null,
      weight_confirmed: input.weightConfirmed === true,
      hunger_rating: input.hungerRating ?? null,
      energy_rating: input.energyRating ?? null,
      mood_rating: input.moodRating ?? null,
      nutrition_adherence: input.nutritionAdherence ?? null,
      training_adherence: input.trainingAdherence ?? null,
      recovery_feeling: input.recoveryFeeling ?? null,
      context_notes: input.contextNotes?.trim() || null,
      context_tags: input.contextTags ?? [],
    };

    if (recommendation) {
      payload.coach_summary = recommendation.text;
      payload.recommendation_kind = recommendation.kind;
      payload.recommendation_text = recommendation.text;
      if (recommendation.proposedCalories != null && bundle.data.currentCalories) {
        const delta =
          recommendation.proposedCalories - bundle.data.currentCalories;
        const protein = bundle.data.currentProteinG ?? 0;
        const carbs = bundle.data.currentCarbsG ?? 0;
        const fat = bundle.data.currentFatG ?? 0;
        // Keep macros roughly proportional for the proposal display.
        const scale =
          bundle.data.currentCalories > 0
            ? recommendation.proposedCalories / bundle.data.currentCalories
            : 1;
        payload.proposal_status = "pending";
        payload.proposed_daily_calories = recommendation.proposedCalories;
        payload.proposed_protein_g = Math.round(protein * scale);
        payload.proposed_carbs_g = Math.round(carbs * scale);
        payload.proposed_fat_g = Math.round(fat * scale);
        void delta;
      } else {
        payload.proposal_status = "none";
        payload.proposed_daily_calories = null;
        payload.proposed_protein_g = null;
        payload.proposed_carbs_g = null;
        payload.proposed_fat_g = null;
      }
      payload.completed_at = new Date().toISOString();
    }

    const query = input.checkInId
      ? supabase
          .from("weekly_check_ins")
          .update(payload)
          .eq("id", input.checkInId)
          .eq("user_id", user.id)
      : supabase.from("weekly_check_ins").upsert(payload, {
          onConflict: "user_id,week_start_date",
        });

    const { data, error } = await query
      .select(CHECK_IN_SELECT)
      .single();

    if (error || !data) {
      console.error("[weekly-check-in] Save failed:", error?.message);
      return { status: "error", message: "Check-in couldn’t be saved." };
    }

    const checkIn = toCheckIn(data as Record<string, unknown>);
    if (!checkIn) {
      return { status: "error", message: "Check-in couldn’t be saved." };
    }
    return { status: "saved", checkIn };
  } catch (error) {
    console.error("[weekly-check-in] Save failed:", error);
    return { status: "error", message: "Check-in couldn’t be saved." };
  }
}

export async function respondWeeklyCheckInProposal(input: {
  checkInId: string;
  accept: boolean;
}): Promise<
  | { status: "saved"; checkIn: WeeklyCheckInRecord }
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
    const { data: existing, error: loadError } = await supabase
      .from("weekly_check_ins")
      .select(CHECK_IN_SELECT)
      .eq("id", input.checkInId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError || !existing) {
      return { status: "error", message: "That check-in couldn’t be found." };
    }

    const checkIn = toCheckIn(existing as Record<string, unknown>);
    if (!checkIn) {
      return { status: "error", message: "That check-in couldn’t be found." };
    }

    // Idempotent: already resolved.
    if (
      checkIn.proposal_status === "accepted" ||
      checkIn.proposal_status === "rejected"
    ) {
      return { status: "saved", checkIn };
    }

    if (checkIn.proposal_status !== "pending") {
      return { status: "error", message: "There’s no pending proposal." };
    }

    if (input.accept) {
      if (
        checkIn.proposed_daily_calories == null ||
        checkIn.proposed_protein_g == null ||
        checkIn.proposed_carbs_g == null ||
        checkIn.proposed_fat_g == null
      ) {
        return { status: "error", message: "Proposal targets are incomplete." };
      }
      const applied = await applyNutritionTargetsForUser(supabase, {
        userId: user.id,
        dailyCalories: checkIn.proposed_daily_calories,
        proteinG: checkIn.proposed_protein_g,
        carbsG: checkIn.proposed_carbs_g,
        fatG: checkIn.proposed_fat_g,
        isManual: false,
        source: "weekly_checkin",
        reason: checkIn.recommendation_text,
      });
      if (applied.status !== "ok") {
        return {
          status: "error",
          message: applied.message ?? "Targets couldn’t be updated.",
        };
      }
    }

    const { data, error } = await supabase
      .from("weekly_check_ins")
      .update({
        proposal_status: input.accept ? "accepted" : "rejected",
      })
      .eq("id", input.checkInId)
      .eq("user_id", user.id)
      .eq("proposal_status", "pending")
      .select(CHECK_IN_SELECT)
      .single();

    if (error || !data) {
      // Race: already resolved.
      const again = toCheckIn(existing as Record<string, unknown>);
      if (again) {
        return { status: "saved", checkIn: again };
      }
      return { status: "error", message: "Proposal couldn’t be updated." };
    }

    const updated = toCheckIn(data as Record<string, unknown>);
    if (!updated) {
      return { status: "error", message: "Proposal couldn’t be updated." };
    }
    return { status: "saved", checkIn: updated };
  } catch (error) {
    console.error("[weekly-check-in] Proposal failed:", error);
    return { status: "error", message: "Proposal couldn’t be updated." };
  }
}
