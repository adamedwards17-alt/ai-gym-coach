"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getLocalLoggedDate } from "@/lib/nutrition";
import {
  buildProgressionRecommendation,
  formatLastPerformance,
  type CompletedSetSnapshot,
} from "@/lib/progression";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  toExerciseRecord,
  type WorkoutSetLogRecord,
} from "@/lib/workout-tracking";

export type InGymSetView = {
  id: string | null;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
  skipped: boolean;
  painReported: boolean;
  painNotes: string | null;
};

export type InGymExerciseView = {
  id: string;
  exerciseId: string;
  sortOrder: number;
  prescribedSets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  supersetGroup: string | null;
  notes: string | null;
  exercise: {
    id: string;
    name: string;
    weightConvention: "per_dumbbell" | "total" | "bodyweight" | "assisted";
    defaultIncrementKg: number;
    notes: string | null;
  };
  lastPerformanceLabel: string | null;
  recommendation: {
    kind: string;
    message: string;
    suggestedWeightKg: number | null;
    suggestedRepsTarget: number | null;
  } | null;
  sets: InGymSetView[];
};

export type InGymWorkoutData = {
  sessionId: string;
  sessionStatus: "in_progress" | "completed" | "abandoned";
  planEntryId: string | null;
  title: string;
  focus: string | null;
  startedAt: string | null;
  template: {
    id: string;
    name: string;
    focus: string | null;
    exercises: InGymExerciseView[];
  };
};

type ActionError = { status: "error"; message: string };

function toSetLog(row: Record<string, unknown>): WorkoutSetLogRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.training_session_id !== "string" ||
    typeof row.exercise_id !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    training_session_id: row.training_session_id,
    exercise_id: row.exercise_id,
    template_exercise_id:
      typeof row.template_exercise_id === "string"
        ? row.template_exercise_id
        : null,
    set_number: Number(row.set_number),
    weight_kg:
      row.weight_kg == null ? null : Number(row.weight_kg),
    reps: row.reps == null ? null : Number(row.reps),
    rir: row.rir == null ? null : Number(row.rir),
    effort: typeof row.effort === "string" ? row.effort : null,
    completed: row.completed === true,
    skipped: row.skipped === true,
    pain_reported: row.pain_reported === true,
    pain_notes: typeof row.pain_notes === "string" ? row.pain_notes : null,
    completed_at:
      typeof row.completed_at === "string" ? row.completed_at : null,
    created_at: row.created_at,
  };
}

async function loadTemplateBundle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  userId: string,
) {
  const { data: template, error } = await supabase
    .from("workout_templates")
    .select("id, code, name, focus, estimated_duration_minutes")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !template) {
    return null;
  }

  const { data: rows } = await supabase
    .from("workout_template_exercises")
    .select(
      "id, exercise_id, sort_order, prescribed_sets, reps_min, reps_max, rest_seconds, superset_group, target_rir_min, target_rir_max, notes",
    )
    .eq("template_id", templateId)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  const exerciseIds = (rows ?? []).map(
    (r) => (r as { exercise_id: string }).exercise_id,
  );
  const { data: exercises } = await supabase
    .from("exercises")
    .select(
      "id, slug, name, primary_muscles, equipment, weight_convention, default_increment_kg, notes",
    )
    .in("id", exerciseIds.length > 0 ? exerciseIds : ["00000000-0000-0000-0000-000000000000"]);

  const exerciseMap = new Map(
    (exercises ?? [])
      .map((row) => toExerciseRecord(row as Record<string, unknown>))
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .map((e) => [e.id, e]),
  );

  return {
    template: template as {
      id: string;
      code: string;
      name: string;
      focus: string | null;
      estimated_duration_minutes: number | null;
    },
    prescriptions: (rows ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const exercise = exerciseMap.get(String(r.exercise_id));
      return {
        id: String(r.id),
        exercise_id: String(r.exercise_id),
        sort_order: Number(r.sort_order),
        prescribed_sets: Number(r.prescribed_sets),
        reps_min: Number(r.reps_min),
        reps_max: Number(r.reps_max),
        rest_seconds: Number(r.rest_seconds),
        superset_group:
          typeof r.superset_group === "string" ? r.superset_group : null,
        target_rir_min:
          typeof r.target_rir_min === "number" ? r.target_rir_min : null,
        target_rir_max:
          typeof r.target_rir_max === "number" ? r.target_rir_max : null,
        notes: typeof r.notes === "string" ? r.notes : null,
        exercise,
      };
    }),
  };
}

async function lastSetsForExercise(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  exerciseId: string,
  excludeSessionId: string | null,
): Promise<{ date: string | null; sets: CompletedSetSnapshot[] }> {
  let query = supabase
    .from("workout_set_logs")
    .select(
      "id, training_session_id, set_number, weight_kg, reps, rir, completed, skipped, pain_reported, completed_at",
    )
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .eq("completed", true)
    .order("completed_at", { ascending: false })
    .limit(40);

  if (excludeSessionId) {
    query = query.neq("training_session_id", excludeSessionId);
  }

  const { data } = await query;
  if (!data || data.length === 0) {
    return { date: null, sets: [] };
  }

  const sessionId = String(
    (data[0] as { training_session_id: string }).training_session_id,
  );
  const sessionSets = data.filter(
    (row) =>
      String((row as { training_session_id: string }).training_session_id) ===
      sessionId,
  );

  const { data: session } = await supabase
    .from("training_sessions")
    .select("session_date")
    .eq("id", sessionId)
    .maybeSingle();

  return {
    date:
      typeof session?.session_date === "string" ? session.session_date : null,
    sets: sessionSets.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        setNumber: Number(r.set_number),
        weightKg: r.weight_kg == null ? null : Number(r.weight_kg),
        reps: r.reps == null ? null : Number(r.reps),
        rir: r.rir == null ? null : Number(r.rir),
        completed: r.completed === true,
        painReported: r.pain_reported === true,
      };
    }),
  };
}

async function buildInGymData(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  sessionId: string;
  planEntryId: string | null;
  templateId: string;
}): Promise<InGymWorkoutData | null> {
  const { supabase, userId, sessionId, planEntryId, templateId } = input;
  const bundle = await loadTemplateBundle(supabase, templateId, userId);
  if (!bundle) {
    return null;
  }

  const { data: session } = await supabase
    .from("training_sessions")
    .select(
      "id, title, session_status, started_at, workout_template_id, notes",
    )
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!session) {
    return null;
  }

  const { data: setRows } = await supabase
    .from("workout_set_logs")
    .select(
      "id, training_session_id, exercise_id, template_exercise_id, set_number, weight_kg, reps, rir, effort, completed, skipped, pain_reported, pain_notes, completed_at, created_at",
    )
    .eq("training_session_id", sessionId)
    .eq("user_id", userId);

  const setsByExercise = new Map<string, WorkoutSetLogRecord[]>();
  for (const row of setRows ?? []) {
    const log = toSetLog(row as Record<string, unknown>);
    if (!log) {
      continue;
    }
    const list = setsByExercise.get(log.exercise_id) ?? [];
    list.push(log);
    setsByExercise.set(log.exercise_id, list);
  }

  const exercises: InGymExerciseView[] = [];
  for (const prescription of bundle.prescriptions) {
    if (!prescription.exercise) {
      continue;
    }
    const ex = prescription.exercise;
    const history = await lastSetsForExercise(
      supabase,
      userId,
      ex.id,
      sessionId,
    );
    const recommendation = buildProgressionRecommendation({
      prescribedSets: prescription.prescribed_sets,
      repsMin: prescription.reps_min,
      repsMax: prescription.reps_max,
      targetRirMin: prescription.target_rir_min,
      targetRirMax: prescription.target_rir_max,
      weightConvention: ex.weight_convention,
      defaultIncrementKg: ex.default_increment_kg,
      configuredIncrementKg: null,
      lastSets: history.sets,
      painReportedThisSession: false,
    });

    const existing = (setsByExercise.get(ex.id) ?? []).sort(
      (a, b) => a.set_number - b.set_number,
    );
    const sets: InGymSetView[] = [];
    for (let n = 1; n <= prescription.prescribed_sets; n += 1) {
      const found = existing.find((s) => s.set_number === n);
      sets.push({
        id: found?.id ?? null,
        setNumber: n,
        weightKg: found?.weight_kg ?? null,
        reps: found?.reps ?? null,
        rir: found?.rir ?? null,
        completed: found?.completed === true,
        skipped: found?.skipped === true,
        painReported: found?.pain_reported === true,
        painNotes: found?.pain_notes ?? null,
      });
    }

    exercises.push({
      id: prescription.id,
      exerciseId: ex.id,
      sortOrder: prescription.sort_order,
      prescribedSets: prescription.prescribed_sets,
      repsMin: prescription.reps_min,
      repsMax: prescription.reps_max,
      restSeconds: prescription.rest_seconds,
      supersetGroup: prescription.superset_group,
      notes: prescription.notes,
      exercise: {
        id: ex.id,
        name: ex.name,
        weightConvention: ex.weight_convention,
        defaultIncrementKg: ex.default_increment_kg,
        notes: ex.notes,
      },
      lastPerformanceLabel: formatLastPerformance(
        history.sets,
        ex.weight_convention,
        history.date,
      ),
      recommendation: {
        kind: recommendation.kind,
        message: recommendation.message,
        suggestedWeightKg: recommendation.suggestedWeightKg,
        suggestedRepsTarget: recommendation.suggestedRepsTarget,
      },
      sets,
    });
  }

  const status =
    session.session_status === "abandoned"
      ? "abandoned"
      : session.session_status === "completed"
        ? "completed"
        : "in_progress";

  return {
    sessionId,
    sessionStatus: status,
    planEntryId,
    title: typeof session.title === "string" ? session.title : bundle.template.name,
    focus: bundle.template.focus,
    startedAt:
      typeof session.started_at === "string" ? session.started_at : null,
    template: {
      id: bundle.template.id,
      name: bundle.template.name,
      focus: bundle.template.focus,
      exercises,
    },
  };
}

export async function loadInGymWorkout(input: {
  planEntryId?: string | null;
  sessionId?: string | null;
  templateId?: string | null;
}): Promise<{ status: "ok"; data: InGymWorkoutData } | ActionError> {
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

    const planEntryId = input.planEntryId ?? null;
    let templateId = input.templateId ?? null;
    let sessionId = input.sessionId ?? null;
    let title = "Strength workout";
    let focus: string | null = null;

    if (planEntryId) {
      const { data: plan } = await supabase
        .from("training_plan_entries")
        .select(
          "id, title, focus, training_type, status, training_session_id, workout_template_id",
        )
        .eq("id", planEntryId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!plan) {
        return { status: "error", message: "That planned workout wasn’t found." };
      }
      if (plan.training_type !== "strength") {
        return {
          status: "error",
          message: "In-gym mode is for strength workouts.",
        };
      }
      title = plan.title;
      focus = typeof plan.focus === "string" ? plan.focus : null;
      templateId =
        templateId ??
        (typeof plan.workout_template_id === "string"
          ? plan.workout_template_id
          : null);
      if (
        !sessionId &&
        typeof plan.training_session_id === "string"
      ) {
        sessionId = plan.training_session_id;
      }
    }

    if (!templateId) {
      // Fall back to first active programme template matching title code.
      const { data: activeProgramme } = await supabase
        .from("training_programmes")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      if (activeProgramme) {
        const { data: templates } = await supabase
          .from("workout_templates")
          .select("id, name")
          .eq("programme_id", activeProgramme.id)
          .order("sort_order", { ascending: true });
        const match =
          (templates ?? []).find((t) =>
            title.toLowerCase().includes(
              String((t as { name: string }).name).toLowerCase(),
            ),
          ) ?? (templates ?? [])[0];
        if (match) {
          templateId = String((match as { id: string }).id);
        }
      }
    }

    if (!templateId) {
      return {
        status: "error",
        message:
          "No workout template is linked. Activate the 6-week programme from Train first.",
      };
    }

    const { data: activePhase } = await supabase
      .from("training_phases")
      .select("id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (sessionId) {
      const data = await buildInGymData({
        supabase,
        userId: user.id,
        sessionId,
        planEntryId,
        templateId,
      });
      if (!data) {
        return { status: "error", message: "Workout session couldn’t be loaded." };
      }
      return { status: "ok", data };
    }

    // Find an existing in-progress session for this plan/template today.
    const { data: existingInProgress } = await supabase
      .from("training_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("session_status", "in_progress")
      .eq("workout_template_id", templateId)
      .eq("session_date", today)
      .limit(1);
    if (existingInProgress?.[0]) {
      sessionId = String((existingInProgress[0] as { id: string }).id);
      if (planEntryId) {
        await supabase
          .from("training_plan_entries")
          .update({ training_session_id: sessionId })
          .eq("id", planEntryId)
          .eq("user_id", user.id)
          .is("training_session_id", null);
      }
    } else {
      const { data: created, error: createError } = await supabase
        .from("training_sessions")
        .insert({
          user_id: user.id,
          session_date: today,
          training_type: "strength",
          title,
          duration_minutes: null,
          notes: focus,
          session_status: "in_progress",
          started_at: new Date().toISOString(),
          workout_template_id: templateId,
          programme_phase_id:
            typeof activePhase?.id === "string" ? activePhase.id : null,
        })
        .select("id")
        .single();
      if (createError || !created) {
        console.error("[workout] Create session failed:", createError?.message);
        return { status: "error", message: "Workout couldn’t be started." };
      }
      sessionId = created.id;
      if (planEntryId) {
        await supabase
          .from("training_plan_entries")
          .update({ training_session_id: sessionId })
          .eq("id", planEntryId)
          .eq("user_id", user.id)
          .is("training_session_id", null);
      }
    }

    if (!sessionId || !templateId) {
      return { status: "error", message: "Workout couldn’t be started." };
    }

    const data = await buildInGymData({
      supabase,
      userId: user.id,
      sessionId,
      planEntryId,
      templateId,
    });
    if (!data) {
      return { status: "error", message: "Workout couldn’t be loaded." };
    }
    return { status: "ok", data };
  } catch (error) {
    console.error("[workout] Load failed:", error);
    return { status: "error", message: "Workout couldn’t be loaded." };
  }
}

export async function saveWorkoutSet(input: {
  sessionId: string;
  exerciseId: string;
  templateExerciseId?: string | null;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rir?: number | null;
  completed: boolean;
  skipped?: boolean;
  painReported?: boolean;
  painNotes?: string | null;
  setLogId?: string | null;
}): Promise<
  | { status: "saved"; setLog: { id: string } }
  | ActionError
> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  if (
    !Number.isInteger(input.setNumber) ||
    input.setNumber < 1 ||
    input.setNumber > 30
  ) {
    return { status: "error", message: "That set number isn’t valid." };
  }
  if (
    input.weightKg != null &&
    (!Number.isFinite(input.weightKg) || input.weightKg < 0 || input.weightKg >= 1000)
  ) {
    return { status: "error", message: "That weight isn’t valid." };
  }
  if (
    input.reps != null &&
    (!Number.isInteger(input.reps) || input.reps < 0 || input.reps > 200)
  ) {
    return { status: "error", message: "Those reps aren’t valid." };
  }
  if (
    input.rir != null &&
    (!Number.isInteger(input.rir) || input.rir < 0 || input.rir > 10)
  ) {
    return { status: "error", message: "That RIR isn’t valid." };
  }

  try {
    const supabase = await createClient();
    const { data: session } = await supabase
      .from("training_sessions")
      .select("id, session_status")
      .eq("id", input.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!session) {
      return { status: "error", message: "Session not found." };
    }
    if (session.session_status === "abandoned") {
      return { status: "error", message: "That workout was abandoned." };
    }

    const payload = {
      user_id: user.id,
      training_session_id: input.sessionId,
      exercise_id: input.exerciseId,
      template_exercise_id: input.templateExerciseId ?? null,
      set_number: input.setNumber,
      weight_kg: input.weightKg,
      reps: input.reps,
      rir: input.rir ?? null,
      completed: input.completed === true,
      skipped: input.skipped === true,
      pain_reported: input.painReported === true,
      pain_notes: input.painNotes?.trim() || null,
      completed_at:
        input.completed === true ? new Date().toISOString() : null,
    };

    if (input.setLogId) {
      const { data, error } = await supabase
        .from("workout_set_logs")
        .update(payload)
        .eq("id", input.setLogId)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error || !data) {
        return { status: "error", message: "Set couldn’t be updated." };
      }
      return { status: "saved", setLog: { id: data.id } };
    }

    const { data, error } = await supabase
      .from("workout_set_logs")
      .upsert(payload, {
        onConflict: "training_session_id,exercise_id,set_number",
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[workout] Set save failed:", error?.message);
      return { status: "error", message: "Set couldn’t be saved." };
    }
    return { status: "saved", setLog: { id: data.id } };
  } catch (error) {
    console.error("[workout] Set save failed:", error);
    return { status: "error", message: "Set couldn’t be saved." };
  }
}

export async function pauseWorkoutSession(
  sessionId: string,
): Promise<{ status: "ok" } | ActionError> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_sessions")
    .update({ paused_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("session_status", "in_progress");
  if (error) {
    return { status: "error", message: "Couldn’t pause the workout." };
  }
  return { status: "ok" };
}

export async function resumeWorkoutSession(
  sessionId: string,
): Promise<{ status: "ok" } | ActionError> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_sessions")
    .update({ paused_at: null })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("session_status", "in_progress");
  if (error) {
    return { status: "error", message: "Couldn’t resume the workout." };
  }
  return { status: "ok" };
}

export async function finishWorkoutSession(input: {
  sessionId: string;
  planEntryId?: string | null;
}): Promise<{ status: "ok"; durationMinutes: number | null } | ActionError> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data: session } = await supabase
      .from("training_sessions")
      .select("id, started_at, session_status")
      .eq("id", input.sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!session) {
      return { status: "error", message: "Session not found." };
    }
    // Idempotent finish.
    if (session.session_status === "completed") {
      return { status: "ok", durationMinutes: null };
    }

    const finishedAt = new Date();
    let durationMinutes: number | null = null;
    if (typeof session.started_at === "string") {
      const started = new Date(session.started_at);
      durationMinutes = Math.max(
        1,
        Math.round((finishedAt.getTime() - started.getTime()) / 60000),
      );
    }

    const { error } = await supabase
      .from("training_sessions")
      .update({
        session_status: "completed",
        finished_at: finishedAt.toISOString(),
        paused_at: null,
        duration_minutes: durationMinutes,
      })
      .eq("id", input.sessionId)
      .eq("user_id", user.id);
    if (error) {
      return { status: "error", message: "Couldn’t finish the workout." };
    }

    if (input.planEntryId) {
      await supabase
        .from("training_plan_entries")
        .update({
          status: "completed",
          training_session_id: input.sessionId,
        })
        .eq("id", input.planEntryId)
        .eq("user_id", user.id)
        .neq("status", "skipped");
    } else {
      await supabase
        .from("training_plan_entries")
        .update({ status: "completed" })
        .eq("user_id", user.id)
        .eq("training_session_id", input.sessionId);
    }

    return { status: "ok", durationMinutes };
  } catch (error) {
    console.error("[workout] Finish failed:", error);
    return { status: "error", message: "Couldn’t finish the workout." };
  }
}

export async function abandonWorkoutSession(
  sessionId: string,
): Promise<{ status: "ok" } | ActionError> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("training_sessions")
    .update({
      session_status: "abandoned",
      finished_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .eq("session_status", "in_progress");
  if (error) {
    return { status: "error", message: "Couldn’t abandon the workout." };
  }
  // Keep plan planned so user can retry; clear link if still planned.
  await supabase
    .from("training_plan_entries")
    .update({ training_session_id: null })
    .eq("user_id", user.id)
    .eq("training_session_id", sessionId)
    .eq("status", "planned");
  return { status: "ok" };
}
