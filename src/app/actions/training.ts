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
  type AvailabilityConstraintRecord,
  type AvailabilityConstraintType,
  isAvailabilityConstraintType,
  isSkipReasonId,
  parsePlanProposalChanges,
  type PlanProposalChange,
  type SkipReasonId,
  type TrainingPlanProposalRecord,
  type PlanProposalStatus,
} from "@/lib/training-plan";
import {
  endOfWeekSunday,
  entriesForDate,
  startOfWeekMonday,
} from "@/lib/training-week";
import {
  isPlanEntryStatus,
  isPlanTrainingTypeId,
  isTrainingIntensityId,
  isTrainingTypeId,
  isValidSessionDate,
  parseCaloriesBurned,
  parseStrengthDetails,
  resolveWeeklySessionTarget,
  type PlanTrainingTypeId,
  type StrengthExerciseDetail,
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
  /** @deprecated Prefer todayPlans — kept for transitional callers. */
  todayPlan: TrainingPlanEntryRecord | null;
  todayPlans: TrainingPlanEntryRecord[];
  weekPlan: TrainingPlanEntryRecord[];
  weekSessions: TrainingSessionRecord[];
  recentSessions: TrainingSessionRecord[];
  todaySteps: DailyStepsRecord | null;
  recentSteps: DailyStepsRecord[];
  dailyStepTarget: number;
  weeklySessionTarget: number;
  trainingFrequency: string | null;
  pendingProposals: TrainingPlanProposalRecord[];
  availabilityConstraints: AvailabilityConstraintRecord[];
};

export type LoadTrainingHubResult =
  | { status: "ok"; data: TrainingHubData }
  | { status: "error"; message: string };

const SESSION_SELECT =
  "id, session_date, training_type, title, duration_minutes, notes, intensity, calories_burned, strength_details, created_at";

const PLAN_SELECT =
  "id, plan_date, training_type, title, focus, planned_duration_minutes, status, training_session_id, original_plan_date, skip_reason, skip_notes, sort_order, rescheduled_from_id, created_at";

const PROPOSAL_SELECT =
  "id, conversation_id, status, reason, changes, created_at, resolved_at";

const CONSTRAINT_SELECT =
  "id, start_date, end_date, constraint_type, notes, active, created_at";

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
    strength_details: parseStrengthDetails(row.strength_details),
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

  const sortOrder =
    typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
      ? Math.round(row.sort_order)
      : 0;

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
    original_plan_date:
      typeof row.original_plan_date === "string"
        ? row.original_plan_date
        : row.plan_date,
    skip_reason: typeof row.skip_reason === "string" ? row.skip_reason : null,
    skip_notes: typeof row.skip_notes === "string" ? row.skip_notes : null,
    sort_order: sortOrder,
    rescheduled_from_id:
      typeof row.rescheduled_from_id === "string"
        ? row.rescheduled_from_id
        : null,
    created_at: row.created_at,
  };
}

function toProposalRecord(
  row: Record<string, unknown>,
): TrainingPlanProposalRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.created_at !== "string" ||
    (row.status !== "pending" &&
      row.status !== "accepted" &&
      row.status !== "rejected" &&
      row.status !== "superseded")
  ) {
    return null;
  }
  return {
    id: row.id,
    conversation_id:
      typeof row.conversation_id === "string" ? row.conversation_id : null,
    status: row.status as PlanProposalStatus,
    reason: typeof row.reason === "string" ? row.reason : null,
    changes: parsePlanProposalChanges(row.changes),
    created_at: row.created_at,
    resolved_at: typeof row.resolved_at === "string" ? row.resolved_at : null,
  };
}

function toConstraintRecord(
  row: Record<string, unknown>,
): AvailabilityConstraintRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.start_date !== "string" ||
    typeof row.end_date !== "string" ||
    !isAvailabilityConstraintType(row.constraint_type) ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    start_date: row.start_date,
    end_date: row.end_date,
    constraint_type: row.constraint_type,
    notes: typeof row.notes === "string" ? row.notes : null,
    active: row.active !== false,
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
    const [
      profileResult,
      planResult,
      sessionResult,
      stepsResult,
      recentResult,
      proposalsResult,
      constraintsResult,
    ] = await Promise.all([
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
        .order("plan_date", { ascending: true })
        .order("sort_order", { ascending: true }),
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
      supabase
        .from("training_plan_proposals")
        .select(PROPOSAL_SELECT)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("availability_constraints")
        .select(CONSTRAINT_SELECT)
        .eq("user_id", user.id)
        .eq("active", true)
        .gte("end_date", localDate)
        .order("start_date", { ascending: true })
        .limit(20),
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

    const todayPlans = entriesForDate(weekPlan, localDate);
    const pendingProposals = (proposalsResult.data ?? [])
      .map((row) => toProposalRecord(row as Record<string, unknown>))
      .filter(
        (entry): entry is TrainingPlanProposalRecord => entry !== null,
      );
    const availabilityConstraints = (constraintsResult.data ?? [])
      .map((row) => toConstraintRecord(row as Record<string, unknown>))
      .filter(
        (entry): entry is AvailabilityConstraintRecord => entry !== null,
      );

    return {
      status: "ok",
      data: {
        localDate,
        weekStart,
        weekEnd,
        todayPlan: todayPlans[0] ?? null,
        todayPlans,
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
        pendingProposals,
        availabilityConstraints,
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
  strengthDetails?: StrengthExerciseDetail[] | null;
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

  const strengthDetails = parseStrengthDetails(input.strengthDetails ?? null);

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

      if (plan.status === "skipped") {
        return {
          status: "error",
          message: "That workout was skipped. Un-skip it before completing.",
        };
      }

      const sessionPayload = {
        training_type: input.trainingType,
        title,
        duration_minutes: input.durationMinutes,
        notes,
        intensity: input.intensity ?? null,
        calories_burned: calories,
        strength_details: strengthDetails,
        session_date: input.sessionDate,
      };

      if (plan.training_session_id) {
        const { data, error } = await supabase
          .from("training_sessions")
          .update(sessionPayload)
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
          .eq("user_id", user.id)
          .is("training_session_id", plan.training_session_id);

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
          ...sessionPayload,
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

      // Link only if still unlinked — prevents duplicate completion races.
      const { data: linked, error: linkError } = await supabase
        .from("training_plan_entries")
        .update({
          status: "completed",
          training_session_id: session.id,
        })
        .eq("id", plan.id)
        .eq("user_id", user.id)
        .is("training_session_id", null)
        .select(PLAN_SELECT)
        .maybeSingle();

      if (linkError) {
        console.error("[training] Plan link failed:", linkError.message);
      }

      if (!linked) {
        // Another request won the race — keep one session, update the linked one.
        const { data: existingPlan } = await supabase
          .from("training_plan_entries")
          .select(PLAN_SELECT)
          .eq("id", plan.id)
          .eq("user_id", user.id)
          .maybeSingle();
        const existing = existingPlan
          ? toPlanRecord(existingPlan as Record<string, unknown>)
          : null;
        if (
          existing?.training_session_id &&
          existing.training_session_id !== session.id
        ) {
          await supabase
            .from("training_sessions")
            .delete()
            .eq("id", session.id)
            .eq("user_id", user.id);
          const { data: winner } = await supabase
            .from("training_sessions")
            .update(sessionPayload)
            .eq("id", existing.training_session_id)
            .eq("user_id", user.id)
            .select(SESSION_SELECT)
            .single();
          const winnerSession = winner
            ? toSessionRecord(winner as Record<string, unknown>)
            : null;
          if (winnerSession) {
            return { status: "saved", session: winnerSession };
          }
        }
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
        strength_details: strengthDetails,
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
      original_plan_date: input.planDate,
    };

    let data: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;

    if (input.entryId) {
      const result = await supabase
        .from("training_plan_entries")
        .update({
          plan_date: payload.plan_date,
          training_type: payload.training_type,
          title: payload.title,
          focus: payload.focus,
          planned_duration_minutes: payload.planned_duration_minutes,
          // Keep original_plan_date when moving; set if missing.
        })
        .eq("id", input.entryId)
        .eq("user_id", user.id)
        .select(PLAN_SELECT)
        .single();
      data = result.data as Record<string, unknown> | null;
      errorMessage = result.error?.message ?? null;

      if (data && !data.original_plan_date) {
        await supabase
          .from("training_plan_entries")
          .update({ original_plan_date: input.planDate })
          .eq("id", input.entryId)
          .eq("user_id", user.id);
      }
    } else {
      const result = await supabase
        .from("training_plan_entries")
        .insert(payload)
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

export type ListProposalsResult =
  | { status: "ok"; proposals: TrainingPlanProposalRecord[] }
  | { status: "error"; message: string };

export async function listPendingTrainingProposals(input?: {
  conversationId?: string | null;
}): Promise<ListProposalsResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  try {
    const supabase = await createClient();
    let query = supabase
      .from("training_plan_proposals")
      .select(PROPOSAL_SELECT)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);
    if (input?.conversationId) {
      query = query.eq("conversation_id", input.conversationId);
    }
    const { data, error } = await query;
    if (error) {
      return { status: "error", message: "Proposals couldn’t be loaded." };
    }
    const proposals = (data ?? [])
      .map((row) => toProposalRecord(row as Record<string, unknown>))
      .filter((row): row is TrainingPlanProposalRecord => row !== null);
    return { status: "ok", proposals };
  } catch {
    return { status: "error", message: "Proposals couldn’t be loaded." };
  }
}

export type SkipPlanResult =
  | { status: "skipped"; entry: TrainingPlanEntryRecord }
  | { status: "error"; message: string };

export async function skipTrainingPlanEntry(input: {
  entryId: string;
  reason: SkipReasonId;
  notes?: string | null;
}): Promise<SkipPlanResult> {
  if (!isSkipReasonId(input.reason)) {
    return { status: "error", message: "Choose a skip reason." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the workout couldn’t be skipped.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? input.notes.trim().slice(0, 400)
      : null;

  try {
    const supabase = await createClient();
    const { data: existingRow, error: loadError } = await supabase
      .from("training_plan_entries")
      .select(PLAN_SELECT)
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (loadError || !existingRow) {
      return {
        status: "error",
        message: "That planned workout couldn’t be found.",
      };
    }

    const existing = toPlanRecord(existingRow as Record<string, unknown>);
    if (!existing) {
      return {
        status: "error",
        message: "That planned workout couldn’t be found.",
      };
    }

    if (existing.training_type === "rest") {
      return { status: "error", message: "Rest days can’t be skipped." };
    }

    if (existing.status === "completed") {
      return {
        status: "error",
        message: "That workout is already completed.",
      };
    }

    if (existing.status === "skipped") {
      return { status: "skipped", entry: existing };
    }

    const { data, error } = await supabase
      .from("training_plan_entries")
      .update({
        status: "skipped",
        skip_reason: input.reason,
        skip_notes: notes,
      })
      .eq("id", input.entryId)
      .eq("user_id", user.id)
      .eq("status", "planned")
      .select(PLAN_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[training] Skip failed:", error.message);
      return {
        status: "error",
        message: "That workout couldn’t be skipped. Try again.",
      };
    }

    if (!data) {
      const { data: again } = await supabase
        .from("training_plan_entries")
        .select(PLAN_SELECT)
        .eq("id", input.entryId)
        .eq("user_id", user.id)
        .maybeSingle();
      const entry = again
        ? toPlanRecord(again as Record<string, unknown>)
        : null;
      if (entry?.status === "skipped") {
        return { status: "skipped", entry };
      }
      return {
        status: "error",
        message: "That workout couldn’t be skipped. Try again.",
      };
    }

    const entry = toPlanRecord(data as Record<string, unknown>);
    if (!entry) {
      return {
        status: "error",
        message: "That workout couldn’t be skipped. Try again.",
      };
    }

    await supabase.from("coach_events").insert({
      user_id: user.id,
      event_date: entry.plan_date,
      event_type: "training_skipped",
      summary: `Skipped “${entry.title}” (${input.reason.replace(/_/g, " ")})${
        notes ? `: ${notes}` : ""
      }`.slice(0, 280),
      active: true,
    });

    return { status: "skipped", entry };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown skip error";
    console.error("[training] Skip failed:", message);
    return {
      status: "error",
      message: "That workout couldn’t be skipped. Try again.",
    };
  }
}

export type ProposalResult =
  | { status: "ok"; proposal: TrainingPlanProposalRecord }
  | { status: "error"; message: string };

export type ResolveProposalResult =
  | { status: "accepted"; proposal: TrainingPlanProposalRecord }
  | { status: "rejected"; proposal: TrainingPlanProposalRecord }
  | { status: "error"; message: string };

export async function createTrainingPlanProposal(input: {
  conversationId?: string | null;
  reason?: string | null;
  changes: PlanProposalChange[];
  idempotencyKey?: string | null;
}): Promise<ProposalResult> {
  if (!input.changes.length) {
    return { status: "error", message: "No plan changes were proposed." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the proposal couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim().slice(0, 120)
      : null;

  try {
    const supabase = await createClient();

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("training_plan_proposals")
        .select(PROPOSAL_SELECT)
        .eq("user_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        const proposal = toProposalRecord(existing as Record<string, unknown>);
        if (proposal) {
          return { status: "ok", proposal };
        }
      }
    }

    // Supersede older pending proposals for the same conversation.
    if (input.conversationId) {
      await supabase
        .from("training_plan_proposals")
        .update({ status: "superseded", resolved_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("conversation_id", input.conversationId)
        .eq("status", "pending");
    }

    const { data, error } = await supabase
      .from("training_plan_proposals")
      .insert({
        user_id: user.id,
        conversation_id: input.conversationId ?? null,
        status: "pending",
        reason:
          typeof input.reason === "string" && input.reason.trim()
            ? input.reason.trim().slice(0, 400)
            : null,
        changes: input.changes.map((change) => ({
          entry_id: change.entryId,
          action: change.action,
          to_date: change.toDate ?? null,
          planned_duration_minutes: change.plannedDurationMinutes ?? null,
          training_type: change.trainingType ?? null,
          title: change.title ?? null,
          focus: change.focus ?? null,
        })),
        idempotency_key: idempotencyKey,
      })
      .select(PROPOSAL_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[training] Proposal create failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That proposal couldn’t be saved. Try again.",
      };
    }

    const proposal = toProposalRecord(data as Record<string, unknown>);
    if (!proposal) {
      return {
        status: "error",
        message: "That proposal couldn’t be saved. Try again.",
      };
    }
    return { status: "ok", proposal };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown proposal error";
    console.error("[training] Proposal create failed:", message);
    return {
      status: "error",
      message: "That proposal couldn’t be saved. Try again.",
    };
  }
}

async function applyProposalChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  change: PlanProposalChange,
): Promise<string | null> {
  const { data: row } = await supabase
    .from("training_plan_entries")
    .select(PLAN_SELECT)
    .eq("id", change.entryId)
    .eq("user_id", userId)
    .maybeSingle();

  const entry = row ? toPlanRecord(row as Record<string, unknown>) : null;
  if (!entry) {
    return "A proposed workout couldn’t be found.";
  }

  if (change.action === "skip" || change.action === "leave_skipped") {
    if (entry.status === "completed") {
      return null;
    }
    await supabase
      .from("training_plan_entries")
      .update({
        status: "skipped",
        skip_reason: entry.skip_reason ?? "other",
      })
      .eq("id", entry.id)
      .eq("user_id", userId);
    return null;
  }

  if (change.action === "move") {
    if (!change.toDate || !isValidSessionDate(change.toDate)) {
      return "A proposed move date isn’t valid.";
    }
    if (entry.status === "completed") {
      return null;
    }
    // Mark original slot as rescheduled and create/move the active entry.
    if (entry.plan_date !== change.toDate) {
      await supabase
        .from("training_plan_entries")
        .update({
          plan_date: change.toDate,
          status: "planned",
          original_plan_date: entry.original_plan_date ?? entry.plan_date,
          rescheduled_from_id: entry.rescheduled_from_id ?? entry.id,
          skip_reason: null,
          skip_notes: null,
        })
        .eq("id", entry.id)
        .eq("user_id", userId);
    }
    return null;
  }

  if (change.action === "shorten") {
    const minutes = change.plannedDurationMinutes;
    if (
      minutes == null ||
      !Number.isFinite(minutes) ||
      minutes <= 0 ||
      minutes > 600
    ) {
      return "A proposed duration isn’t valid.";
    }
    await supabase
      .from("training_plan_entries")
      .update({ planned_duration_minutes: Math.round(minutes) })
      .eq("id", entry.id)
      .eq("user_id", userId);
    return null;
  }

  if (change.action === "replace") {
    const patch: Record<string, unknown> = {};
    if (change.trainingType && isPlanTrainingTypeId(change.trainingType)) {
      patch.training_type = change.trainingType;
    }
    if (typeof change.title === "string" && change.title.trim()) {
      patch.title = change.title.trim().slice(0, 120);
    }
    if (typeof change.focus === "string") {
      patch.focus = change.focus.trim().slice(0, 120) || null;
    }
    if (change.plannedDurationMinutes != null) {
      patch.planned_duration_minutes = Math.round(change.plannedDurationMinutes);
    }
    if (Object.keys(patch).length > 0) {
      await supabase
        .from("training_plan_entries")
        .update(patch)
        .eq("id", entry.id)
        .eq("user_id", userId);
    }
    return null;
  }

  return null;
}

export async function acceptTrainingPlanProposal(input: {
  proposalId: string;
}): Promise<ResolveProposalResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the proposal couldn’t be applied.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("training_plan_proposals")
      .select(PROPOSAL_SELECT)
      .eq("id", input.proposalId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !row) {
      return { status: "error", message: "That proposal couldn’t be found." };
    }

    const proposal = toProposalRecord(row as Record<string, unknown>);
    if (!proposal) {
      return { status: "error", message: "That proposal couldn’t be found." };
    }

    if (proposal.status === "accepted") {
      return { status: "accepted", proposal };
    }
    if (proposal.status !== "pending") {
      return {
        status: "error",
        message: "That proposal is no longer pending.",
      };
    }

    for (const change of proposal.changes) {
      const applyError = await applyProposalChange(supabase, user.id, change);
      if (applyError) {
        return { status: "error", message: applyError };
      }
    }

    const resolvedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("training_plan_proposals")
      .update({ status: "accepted", resolved_at: resolvedAt })
      .eq("id", proposal.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select(PROPOSAL_SELECT)
      .maybeSingle();

    if (updateError || !updated) {
      // Another accept won — treat as success if already accepted.
      const { data: again } = await supabase
        .from("training_plan_proposals")
        .select(PROPOSAL_SELECT)
        .eq("id", proposal.id)
        .eq("user_id", user.id)
        .maybeSingle();
      const againProposal = again
        ? toProposalRecord(again as Record<string, unknown>)
        : null;
      if (againProposal?.status === "accepted") {
        return { status: "accepted", proposal: againProposal };
      }
      return {
        status: "error",
        message: "Those changes couldn’t be confirmed. Try again.",
      };
    }

    await supabase.from("coach_events").insert({
      user_id: user.id,
      event_date: new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      event_type: "plan_change",
      summary: (
        proposal.reason ??
        `Accepted ${proposal.changes.length} plan change(s)`
      ).slice(0, 280),
      source_conversation_id: proposal.conversation_id,
      active: true,
    });

    const accepted = toProposalRecord(updated as Record<string, unknown>);
    if (!accepted) {
      return {
        status: "error",
        message: "Those changes couldn’t be confirmed. Try again.",
      };
    }
    return { status: "accepted", proposal: accepted };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown accept error";
    console.error("[training] Accept proposal failed:", message);
    return {
      status: "error",
      message: "Those changes couldn’t be confirmed. Try again.",
    };
  }
}

export async function rejectTrainingPlanProposal(input: {
  proposalId: string;
}): Promise<ResolveProposalResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the proposal couldn’t be updated.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from("training_plan_proposals")
      .select(PROPOSAL_SELECT)
      .eq("id", input.proposalId)
      .eq("user_id", user.id)
      .maybeSingle();

    const existing = row
      ? toProposalRecord(row as Record<string, unknown>)
      : null;
    if (!existing) {
      return { status: "error", message: "That proposal couldn’t be found." };
    }
    if (existing.status === "rejected") {
      return { status: "rejected", proposal: existing };
    }
    if (existing.status !== "pending") {
      return {
        status: "error",
        message: "That proposal is no longer pending.",
      };
    }

    const { data, error } = await supabase
      .from("training_plan_proposals")
      .update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select(PROPOSAL_SELECT)
      .maybeSingle();

    if (error || !data) {
      return {
        status: "error",
        message: "That proposal couldn’t be rejected. Try again.",
      };
    }

    const proposal = toProposalRecord(data as Record<string, unknown>);
    if (!proposal) {
      return {
        status: "error",
        message: "That proposal couldn’t be rejected. Try again.",
      };
    }
    return { status: "rejected", proposal };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown reject error";
    console.error("[training] Reject proposal failed:", message);
    return {
      status: "error",
      message: "That proposal couldn’t be rejected. Try again.",
    };
  }
}

export type SaveConstraintResult =
  | { status: "saved"; constraint: AvailabilityConstraintRecord }
  | { status: "error"; message: string };

export async function upsertAvailabilityConstraint(input: {
  id?: string | null;
  startDate: string;
  endDate: string;
  constraintType: AvailabilityConstraintType;
  notes?: string | null;
  active?: boolean;
  conversationId?: string | null;
}): Promise<SaveConstraintResult> {
  if (
    !isValidSessionDate(input.startDate) ||
    !isValidSessionDate(input.endDate)
  ) {
    return { status: "error", message: "Those dates aren’t valid." };
  }
  if (input.endDate < input.startDate) {
    return {
      status: "error",
      message: "End date must be on or after the start date.",
    };
  }
  if (!isAvailabilityConstraintType(input.constraintType)) {
    return { status: "error", message: "Choose a constraint type." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so availability couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? input.notes.trim().slice(0, 400)
      : null;

  try {
    const supabase = await createClient();
    const payload = {
      user_id: user.id,
      start_date: input.startDate,
      end_date: input.endDate,
      constraint_type: input.constraintType,
      notes,
      active: input.active !== false,
      source_conversation_id: input.conversationId ?? null,
    };

    let data: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;

    if (input.id) {
      const result = await supabase
        .from("availability_constraints")
        .update(payload)
        .eq("id", input.id)
        .eq("user_id", user.id)
        .select(CONSTRAINT_SELECT)
        .single();
      data = result.data as Record<string, unknown> | null;
      errorMessage = result.error?.message ?? null;
    } else {
      const result = await supabase
        .from("availability_constraints")
        .insert(payload)
        .select(CONSTRAINT_SELECT)
        .single();
      data = result.data as Record<string, unknown> | null;
      errorMessage = result.error?.message ?? null;
    }

    if (errorMessage || !data) {
      console.error(
        "[training] Constraint save failed:",
        errorMessage ?? "No row",
      );
      return {
        status: "error",
        message: "Availability couldn’t be saved. Try again.",
      };
    }

    const constraint = toConstraintRecord(data);
    if (!constraint) {
      return {
        status: "error",
        message: "Availability couldn’t be saved. Try again.",
      };
    }

    await supabase.from("coach_events").insert({
      user_id: user.id,
      event_date: input.startDate,
      event_type: "lifestyle_note",
      summary: `Availability: ${input.constraintType.replace(/_/g, " ")} ${
        input.startDate
      }–${input.endDate}${notes ? ` — ${notes}` : ""}`.slice(0, 280),
      source_conversation_id: input.conversationId ?? null,
      active: true,
    });

    return { status: "saved", constraint };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown constraint error";
    console.error("[training] Constraint save failed:", message);
    return {
      status: "error",
      message: "Availability couldn’t be saved. Try again.",
    };
  }
}

export async function deactivateAvailabilityConstraint(input: {
  id: string;
}): Promise<{ status: "ok" } | { status: "error"; message: string }> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected.",
    };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("availability_constraints")
      .update({ active: false })
      .eq("id", input.id)
      .eq("user_id", user.id);
    if (error) {
      return {
        status: "error",
        message: "That constraint couldn’t be removed.",
      };
    }
    return { status: "ok" };
  } catch {
    return {
      status: "error",
      message: "That constraint couldn’t be removed.",
    };
  }
}
