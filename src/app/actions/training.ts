"use server";

import {
  parseStepCount,
  parseStepTarget,
  resolveDailyStepTarget,
  type DailyStepsRecord,
} from "@/lib/activity-steps";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  endOfWeekSunday,
  startOfWeekMonday,
} from "@/lib/training-week";
import {
  isPlanEntryStatus,
  isPlanTrainingTypeId,
  isTrainingIntensityId,
  isTrainingTypeId,
  isValidSessionDate,
  parseCaloriesBurned,
  resolveWeeklySessionTarget,
  type PlanTrainingTypeId,
  type TrainingIntensityId,
  type TrainingPlanEntryRecord,
  type TrainingSessionRecord,
  type TrainingTypeId,
} from "@/lib/training";

export type ListTrainingResult =
  | { status: "ok"; sessions: TrainingSessionRecord[] }
  | { status: "error"; message: string };

export type SaveTrainingResult =
  | { status: "saved"; session: TrainingSessionRecord }
  | { status: "error"; message: string };

export type TrainingHubData = {
  localDate: string;
  weekStart: string;
  weekEnd: string;
  todayPlan: TrainingPlanEntryRecord | null;
  weekPlan: TrainingPlanEntryRecord[];
  weekSessions: TrainingSessionRecord[];
  recentSessions: TrainingSessionRecord[];
  todaySteps: DailyStepsRecord | null;
  recentSteps: DailyStepsRecord[];
  dailyStepTarget: number;
  weeklySessionTarget: number;
  trainingFrequency: string | null;
};

export type LoadTrainingHubResult =
  | { status: "ok"; data: TrainingHubData }
  | { status: "error"; message: string };

const SESSION_SELECT =
  "id, session_date, training_type, title, duration_minutes, notes, intensity, calories_burned, created_at";

const PLAN_SELECT =
  "id, plan_date, training_type, title, focus, planned_duration_minutes, status, training_session_id, created_at";

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

function toPlanRecord(
  row: Record<string, unknown>,
): TrainingPlanEntryRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.plan_date !== "string" ||
    !isPlanTrainingTypeId(row.training_type) ||
    typeof row.title !== "string" ||
    typeof row.created_at !== "string" ||
    !isPlanEntryStatus(row.status)
  ) {
    return null;
  }

  const planned =
    row.planned_duration_minutes === null ||
    row.planned_duration_minutes === undefined
      ? null
      : Number(row.planned_duration_minutes);

  return {
    id: row.id,
    plan_date: row.plan_date,
    training_type: row.training_type,
    title: row.title,
    focus: typeof row.focus === "string" ? row.focus : null,
    planned_duration_minutes:
      planned != null && Number.isFinite(planned) && planned > 0
        ? Math.round(planned)
        : null,
    status: row.status,
    training_session_id:
      typeof row.training_session_id === "string"
        ? row.training_session_id
        : null,
    created_at: row.created_at,
  };
}

function toStepsRecord(row: Record<string, unknown>): DailyStepsRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.step_date !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }
  const steps = Number(row.steps);
  if (!Number.isFinite(steps) || steps < 0) {
    return null;
  }
  return {
    id: row.id,
    step_date: row.step_date,
    steps: Math.round(steps),
    updated_at: row.updated_at,
  };
}

export async function listRecentTrainingSessions(
  limit = 8,
): Promise<ListTrainingResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so training history can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("training_sessions")
      .select(SESSION_SELECT)
      .eq("user_id", user.id)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 30));

    if (error) {
      console.error("[training] List failed:", error.message);
      return {
        status: "error",
        message: "Training history couldn’t be loaded. Try again.",
      };
    }

    const sessions = (data ?? [])
      .map((row) => toSessionRecord(row as Record<string, unknown>))
      .filter((session): session is TrainingSessionRecord => session !== null);

    return { status: "ok", sessions };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown training list error";
    console.error("[training] List failed:", message);
    return {
      status: "error",
      message: "Training history couldn’t be loaded. Try again.",
    };
  }
}

export async function loadTrainingHub(
  localDate: string,
): Promise<LoadTrainingHubResult> {
  if (!isValidSessionDate(localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so Train can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const weekStart = startOfWeekMonday(localDate);
  const weekEnd = endOfWeekSunday(localDate);
  const stepsFrom = startOfWeekMonday(
    // Look back an extra week for trends.
    (() => {
      const [y, m, d] = weekStart.split("-").map(Number);
      const date = new Date(y, m - 1, d - 7);
      return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    })(),
  );

  try {
    const supabase = await createClient();
    const [profileResult, planResult, sessionResult, stepsResult, recentResult] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "daily_step_target, weekly_session_target, training_frequency",
          )
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("training_plan_entries")
          .select(PLAN_SELECT)
          .eq("user_id", user.id)
          .gte("plan_date", weekStart)
          .lte("plan_date", weekEnd)
          .order("plan_date", { ascending: true }),
        supabase
          .from("training_sessions")
          .select(SESSION_SELECT)
          .eq("user_id", user.id)
          .gte("session_date", weekStart)
          .lte("session_date", weekEnd)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("daily_steps")
          .select("id, step_date, steps, updated_at")
          .eq("user_id", user.id)
          .gte("step_date", stepsFrom)
          .lte("step_date", localDate)
          .order("step_date", { ascending: false }),
        supabase
          .from("training_sessions")
          .select(SESSION_SELECT)
          .eq("user_id", user.id)
          .order("session_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(12),
      ]);

    if (planResult.error) {
      console.error("[training] Plan load failed:", planResult.error.message);
      return {
        status: "error",
        message: "Training plan couldn’t be loaded. Try again.",
      };
    }
    if (sessionResult.error) {
      console.error(
        "[training] Week sessions load failed:",
        sessionResult.error.message,
      );
      return {
        status: "error",
        message: "Training sessions couldn’t be loaded. Try again.",
      };
    }
    if (stepsResult.error) {
      console.error("[training] Steps load failed:", stepsResult.error.message);
      return {
        status: "error",
        message: "Step history couldn’t be loaded. Try again.",
      };
    }

    const weekPlan = (planResult.data ?? [])
      .map((row) => toPlanRecord(row as Record<string, unknown>))
      .filter((entry): entry is TrainingPlanEntryRecord => entry !== null);

    const weekSessions = (sessionResult.data ?? [])
      .map((row) => toSessionRecord(row as Record<string, unknown>))
      .filter((session): session is TrainingSessionRecord => session !== null);

    const recentSessions = (recentResult.data ?? [])
      .map((row) => toSessionRecord(row as Record<string, unknown>))
      .filter((session): session is TrainingSessionRecord => session !== null);

    const recentSteps = (stepsResult.data ?? [])
      .map((row) => toStepsRecord(row as Record<string, unknown>))
      .filter((entry): entry is DailyStepsRecord => entry !== null);

    const profile = profileResult.data as Record<string, unknown> | null;
    const frequency =
      typeof profile?.training_frequency === "string"
        ? profile.training_frequency
        : null;

    return {
      status: "ok",
      data: {
        localDate,
        weekStart,
        weekEnd,
        todayPlan: weekPlan.find((entry) => entry.plan_date === localDate) ?? null,
        weekPlan,
        weekSessions,
        recentSessions,
        todaySteps:
          recentSteps.find((entry) => entry.step_date === localDate) ?? null,
        recentSteps,
        dailyStepTarget: resolveDailyStepTarget(
          typeof profile?.daily_step_target === "number"
            ? profile.daily_step_target
            : null,
        ),
        weeklySessionTarget: resolveWeeklySessionTarget(
          typeof profile?.weekly_session_target === "number"
            ? profile.weekly_session_target
            : null,
          frequency,
        ),
        trainingFrequency: frequency,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown training hub error";
    console.error("[training] Hub load failed:", message);
    return {
      status: "error",
      message: "Train couldn’t be loaded. Try again.",
    };
  }
}

export async function saveTrainingSession(input: {
  sessionDate: string;
  trainingType: TrainingTypeId;
  title: string;
  durationMinutes: number | null;
  notes?: string | null;
  intensity?: TrainingIntensityId | null;
  caloriesBurned?: number | null;
  /** When completing a plan entry, pass its id to avoid duplicate sessions. */
  planEntryId?: string | null;
}): Promise<SaveTrainingResult> {
  if (!isValidSessionDate(input.sessionDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isTrainingTypeId(input.trainingType)) {
    return { status: "error", message: "Choose what you trained." };
  }

  const title = input.title.trim();
  if (!title) {
    return { status: "error", message: "Add a short description of the session." };
  }

  if (
    input.durationMinutes !== null &&
    (!Number.isFinite(input.durationMinutes) ||
      input.durationMinutes <= 0 ||
      input.durationMinutes > 600)
  ) {
    return { status: "error", message: "That duration isn’t valid." };
  }

  if (
    input.intensity != null &&
    !isTrainingIntensityId(input.intensity)
  ) {
    return { status: "error", message: "That intensity isn’t valid." };
  }

  const calories =
    input.caloriesBurned === undefined
      ? null
      : parseCaloriesBurned(input.caloriesBurned);
  if (input.caloriesBurned != null && calories == null) {
    return {
      status: "error",
      message: "Calories burned must be between 0 and 5,000.",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the session couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;

  try {
    const supabase = await createClient();

    // Completing an existing plan: reuse linked session if present.
    if (input.planEntryId) {
      const { data: planRow, error: planError } = await supabase
        .from("training_plan_entries")
        .select(PLAN_SELECT)
        .eq("id", input.planEntryId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (planError || !planRow) {
        return {
          status: "error",
          message: "That planned session couldn’t be found.",
        };
      }

      const plan = toPlanRecord(planRow as Record<string, unknown>);
      if (!plan) {
        return {
          status: "error",
          message: "That planned session couldn’t be found.",
        };
      }

      if (plan.training_type === "rest") {
        return {
          status: "error",
          message: "Rest days aren’t logged as workouts.",
        };
      }

      if (plan.training_session_id) {
        const { data, error } = await supabase
          .from("training_sessions")
          .update({
            training_type: input.trainingType,
            title,
            duration_minutes: input.durationMinutes,
            notes,
            intensity: input.intensity ?? null,
            calories_burned: calories,
            session_date: input.sessionDate,
          })
          .eq("id", plan.training_session_id)
          .eq("user_id", user.id)
          .select(SESSION_SELECT)
          .single();

        if (error || !data) {
          console.error(
            "[training] Update linked session failed:",
            error?.message ?? "No row",
          );
          return {
            status: "error",
            message: "That session couldn’t be updated. Try again.",
          };
        }

        await supabase
          .from("training_plan_entries")
          .update({ status: "completed" })
          .eq("id", plan.id)
          .eq("user_id", user.id);

        const session = toSessionRecord(data as Record<string, unknown>);
        if (!session) {
          return {
            status: "error",
            message: "That session couldn’t be updated. Try again.",
          };
        }
        return { status: "saved", session };
      }

      const { data, error } = await supabase
        .from("training_sessions")
        .insert({
          user_id: user.id,
          session_date: input.sessionDate,
          training_type: input.trainingType,
          title,
          duration_minutes: input.durationMinutes,
          notes,
          intensity: input.intensity ?? null,
          calories_burned: calories,
        })
        .select(SESSION_SELECT)
        .single();

      if (error || !data) {
        console.error(
          "[training] Save failed:",
          error?.message ?? "No row returned",
        );
        return {
          status: "error",
          message: "That session couldn’t be saved. Try again.",
        };
      }

      const session = toSessionRecord(data as Record<string, unknown>);
      if (!session) {
        return {
          status: "error",
          message: "That session couldn’t be saved. Try again.",
        };
      }

      const { error: linkError } = await supabase
        .from("training_plan_entries")
        .update({
          status: "completed",
          training_session_id: session.id,
        })
        .eq("id", plan.id)
        .eq("user_id", user.id);

      if (linkError) {
        console.error("[training] Plan link failed:", linkError.message);
        // Session exists; surface soft failure so UI can refresh.
      }

      return { status: "saved", session };
    }

    const { data, error } = await supabase
      .from("training_sessions")
      .insert({
        user_id: user.id,
        session_date: input.sessionDate,
        training_type: input.trainingType,
        title,
        duration_minutes: input.durationMinutes,
        notes,
        intensity: input.intensity ?? null,
        calories_burned: calories,
      })
      .select(SESSION_SELECT)
      .single();

    if (error || !data) {
      console.error("[training] Save failed:", error?.message ?? "No row returned");
      return {
        status: "error",
        message: "That session couldn’t be saved. Try again.",
      };
    }

    const session = toSessionRecord(data as Record<string, unknown>);
    if (!session) {
      return {
        status: "error",
        message: "That session couldn’t be saved. Try again.",
      };
    }

    return { status: "saved", session };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown training save error";
    console.error("[training] Save failed:", message);
    return {
      status: "error",
      message: "That session couldn’t be saved. Try again.",
    };
  }
}

export type UpsertPlanResult =
  | { status: "saved"; entry: TrainingPlanEntryRecord }
  | { status: "error"; message: string };

export type DeletePlanResult =
  | { status: "deleted" }
  | { status: "error"; message: string };

export async function upsertTrainingPlanEntry(input: {
  planDate: string;
  trainingType: PlanTrainingTypeId;
  title: string;
  focus?: string | null;
  plannedDurationMinutes?: number | null;
  /** When moving an existing entry. */
  entryId?: string | null;
}): Promise<UpsertPlanResult> {
  if (!isValidSessionDate(input.planDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }
  if (!isPlanTrainingTypeId(input.trainingType)) {
    return { status: "error", message: "Choose a training type." };
  }

  const title =
    input.trainingType === "rest"
      ? input.title.trim() || "Rest day"
      : input.title.trim();
  if (!title) {
    return { status: "error", message: "Add a session name." };
  }

  const planned =
    input.plannedDurationMinutes === undefined ||
    input.plannedDurationMinutes === null
      ? null
      : Number(input.plannedDurationMinutes);
  if (
    planned != null &&
    (!Number.isFinite(planned) || planned <= 0 || planned > 600)
  ) {
    return { status: "error", message: "That planned duration isn’t valid." };
  }

  const focus =
    typeof input.focus === "string" && input.focus.trim()
      ? input.focus.trim().slice(0, 120)
      : null;

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the plan couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const payload = {
      user_id: user.id,
      plan_date: input.planDate,
      training_type: input.trainingType,
      title,
      focus: input.trainingType === "rest" ? null : focus,
      planned_duration_minutes:
        input.trainingType === "rest" ? null : planned,
      status: "planned" as const,
    };

    let data: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;

    if (input.entryId) {
      const result = await supabase
        .from("training_plan_entries")
        .update(payload)
        .eq("id", input.entryId)
        .eq("user_id", user.id)
        .select(PLAN_SELECT)
        .single();
      data = result.data as Record<string, unknown> | null;
      errorMessage = result.error?.message ?? null;
    } else {
      const result = await supabase
        .from("training_plan_entries")
        .upsert(payload, { onConflict: "user_id,plan_date" })
        .select(PLAN_SELECT)
        .single();
      data = result.data as Record<string, unknown> | null;
      errorMessage = result.error?.message ?? null;
    }

    if (errorMessage || !data) {
      console.error("[training] Plan upsert failed:", errorMessage ?? "No row");
      return {
        status: "error",
        message: "That plan entry couldn’t be saved. Try again.",
      };
    }

    const entry = toPlanRecord(data);
    if (!entry) {
      return {
        status: "error",
        message: "That plan entry couldn’t be saved. Try again.",
      };
    }
    return { status: "saved", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown plan save error";
    console.error("[training] Plan upsert failed:", message);
    return {
      status: "error",
      message: "That plan entry couldn’t be saved. Try again.",
    };
  }
}

export async function deleteTrainingPlanEntry(input: {
  entryId: string;
}): Promise<DeletePlanResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the plan couldn’t be updated.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("training_plan_entries")
      .delete()
      .eq("id", input.entryId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[training] Plan delete failed:", error.message);
      return {
        status: "error",
        message: "That plan entry couldn’t be removed. Try again.",
      };
    }
    return { status: "deleted" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown plan delete error";
    console.error("[training] Plan delete failed:", message);
    return {
      status: "error",
      message: "That plan entry couldn’t be removed. Try again.",
    };
  }
}

export type UpsertStepsResult =
  | { status: "saved"; entry: DailyStepsRecord }
  | { status: "error"; message: string };

export async function upsertDailySteps(input: {
  stepDate: string;
  steps: number;
}): Promise<UpsertStepsResult> {
  if (!isValidSessionDate(input.stepDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const steps = parseStepCount(input.steps);
  if (steps == null) {
    return {
      status: "error",
      message: "Steps must be a whole number between 0 and 200,000.",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so steps couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_steps")
      .upsert(
        {
          user_id: user.id,
          step_date: input.stepDate,
          steps,
        },
        { onConflict: "user_id,step_date" },
      )
      .select("id, step_date, steps, updated_at")
      .single();

    if (error || !data) {
      console.error("[training] Steps upsert failed:", error?.message ?? "No row");
      return {
        status: "error",
        message: "Steps couldn’t be saved. Try again.",
      };
    }

    const entry = toStepsRecord(data as Record<string, unknown>);
    if (!entry) {
      return {
        status: "error",
        message: "Steps couldn’t be saved. Try again.",
      };
    }
    return { status: "saved", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown steps save error";
    console.error("[training] Steps upsert failed:", message);
    return {
      status: "error",
      message: "Steps couldn’t be saved. Try again.",
    };
  }
}

export type UpdateTargetsResult =
  | { status: "saved"; dailyStepTarget: number; weeklySessionTarget: number }
  | { status: "error"; message: string };

export async function updateActivityTargets(input: {
  dailyStepTarget?: number;
  weeklySessionTarget?: number;
}): Promise<UpdateTargetsResult> {
  const daily =
    input.dailyStepTarget === undefined
      ? undefined
      : parseStepTarget(input.dailyStepTarget);
  if (input.dailyStepTarget !== undefined && daily == null) {
    return {
      status: "error",
      message: "Daily step target must be between 1,000 and 100,000.",
    };
  }

  let weekly: number | undefined;
  if (input.weeklySessionTarget !== undefined) {
    const n = Math.round(Number(input.weeklySessionTarget));
    if (!Number.isFinite(n) || n < 1 || n > 14) {
      return {
        status: "error",
        message: "Weekly session target must be between 1 and 14.",
      };
    }
    weekly = n;
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so targets couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const patch: Record<string, number> = {};
    if (daily != null) {
      patch.daily_step_target = daily;
    }
    if (weekly != null) {
      patch.weekly_session_target = weekly;
    }
    if (Object.keys(patch).length === 0) {
      return { status: "error", message: "Nothing to update." };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("daily_step_target, weekly_session_target, training_frequency")
      .single();

    if (error || !data) {
      console.error(
        "[training] Targets update failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "Targets couldn’t be saved. Try again.",
      };
    }

    const row = data as Record<string, unknown>;
    return {
      status: "saved",
      dailyStepTarget: resolveDailyStepTarget(
        typeof row.daily_step_target === "number" ? row.daily_step_target : null,
      ),
      weeklySessionTarget: resolveWeeklySessionTarget(
        typeof row.weekly_session_target === "number"
          ? row.weekly_session_target
          : null,
        typeof row.training_frequency === "string"
          ? row.training_frequency
          : null,
      ),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown targets error";
    console.error("[training] Targets update failed:", message);
    return {
      status: "error",
      message: "Targets couldn’t be saved. Try again.",
    };
  }
}
