"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { getLocalLoggedDate } from "@/lib/nutrition";
import {
  assertProgrammeIntegrity,
  MUSCLE_BUILDING_6WK,
} from "@/lib/programmes/muscle-building-6wk";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { startOfWeekMonday, addDays } from "@/lib/training-week";
import type {
  TrainingPhaseRecord,
  TrainingProgrammeSummary,
} from "@/lib/workout-tracking";

export type ActivateProgrammeResult =
  | { status: "activated"; programme: TrainingProgrammeSummary; weeksSeeded: number }
  | { status: "already_active"; programme: TrainingProgrammeSummary }
  | { status: "error"; message: string };

export type LoadProgrammeResult =
  | { status: "ok"; programme: TrainingProgrammeSummary | null }
  | { status: "error"; message: string };

async function loadProgrammeSummary(
  userId: string,
): Promise<TrainingProgrammeSummary | null> {
  const supabase = await createClient();
  const { data: programme } = await supabase
    .from("training_programmes")
    .select("id, slug, name, description, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!programme) {
    return null;
  }

  const [{ data: phases }, { data: templates }] = await Promise.all([
    supabase
      .from("training_phases")
      .select(
        "id, slug, name, kind, status, start_date, end_date, duration_weeks, notes, sort_order",
      )
      .eq("programme_id", programme.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("workout_templates")
      .select("id, code, name, focus")
      .eq("programme_id", programme.id)
      .order("sort_order", { ascending: true }),
  ]);

  const phaseRows = (phases ?? []) as TrainingPhaseRecord[];
  return {
    id: programme.id,
    slug: programme.slug,
    name: programme.name,
    description:
      typeof programme.description === "string" ? programme.description : null,
    status: programme.status === "archived" ? "archived" : "active",
    activePhase: phaseRows.find((p) => p.status === "active") ?? null,
    upcomingPhase: phaseRows.find((p) => p.status === "upcoming") ?? null,
    templates: (templates ?? []).map((t) => ({
      id: String((t as { id: string }).id),
      code: String((t as { code: string }).code),
      name: String((t as { name: string }).name),
      focus:
        typeof (t as { focus?: string }).focus === "string"
          ? (t as { focus: string }).focus
          : null,
    })),
  };
}

export async function loadActiveProgramme(): Promise<LoadProgrammeResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  try {
    const programme = await loadProgrammeSummary(user.id);
    return { status: "ok", programme };
  } catch (error) {
    console.error("[programme] Load failed:", error);
    return { status: "error", message: "Programme couldn’t be loaded." };
  }
}

/**
 * Activate the default 6-week muscle-building programme for the current user
 * and seed the current + next week of plan entries from the weekly schedule.
 */
export async function activateMuscleBuildingProgramme(input?: {
  weeksToSeed?: number;
}): Promise<ActivateProgrammeResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const integrity = assertProgrammeIntegrity(MUSCLE_BUILDING_6WK);
  if (integrity.length > 0) {
    console.error("[programme] Integrity errors:", integrity);
    return { status: "error", message: "Programme definition is invalid." };
  }

  try {
    const supabase = await createClient();
    const existing = await loadProgrammeSummary(user.id);
    if (existing) {
      return { status: "already_active", programme: existing };
    }

    const def = MUSCLE_BUILDING_6WK;
    const today = getLocalLoggedDate();

    const { data: programme, error: programmeError } = await supabase
      .from("training_programmes")
      .insert({
        user_id: user.id,
        slug: def.slug,
        name: def.name,
        description: def.description,
        status: "active",
      })
      .select("id")
      .single();

    if (programmeError || !programme) {
      console.error("[programme] Insert failed:", programmeError?.message);
      return { status: "error", message: "Programme couldn’t be created." };
    }

    for (const phase of def.phases) {
      const startDate = phase.status === "active" ? today : null;
      const endDate =
        phase.status === "active" && phase.durationWeeks
          ? addDays(today, phase.durationWeeks * 7 - 1)
          : null;
      await supabase.from("training_phases").insert({
        user_id: user.id,
        programme_id: programme.id,
        slug: phase.slug,
        name: phase.name,
        kind: phase.kind,
        status: phase.status,
        start_date: startDate,
        end_date: endDate,
        duration_weeks: phase.durationWeeks,
        notes: phase.notes,
        sort_order: phase.sortOrder,
      });
    }

    const { data: exerciseRows } = await supabase
      .from("exercises")
      .select("id, slug");
    const exerciseBySlug = new Map<string, string>();
    for (const row of exerciseRows ?? []) {
      const r = row as { id: string; slug: string };
      exerciseBySlug.set(r.slug, r.id);
    }

    const templateIdByCode = new Map<string, string>();
    let sort = 0;
    for (const template of def.templates) {
      const { data: templateRow, error: templateError } = await supabase
        .from("workout_templates")
        .insert({
          user_id: user.id,
          programme_id: programme.id,
          code: template.code,
          name: template.name,
          focus: template.focus,
          estimated_duration_minutes: template.estimatedDurationMinutes,
          sort_order: sort,
        })
        .select("id")
        .single();
      sort += 1;
      if (templateError || !templateRow) {
        console.error("[programme] Template failed:", templateError?.message);
        return { status: "error", message: "Workout templates couldn’t be saved." };
      }
      templateIdByCode.set(template.code, templateRow.id);

      let exSort = 0;
      for (const exercise of template.exercises) {
        const exerciseId = exerciseBySlug.get(exercise.exerciseSlug);
        if (!exerciseId) {
          return {
            status: "error",
            message: `Missing exercise catalogue entry: ${exercise.exerciseSlug}`,
          };
        }
        await supabase.from("workout_template_exercises").insert({
          user_id: user.id,
          template_id: templateRow.id,
          exercise_id: exerciseId,
          sort_order: exSort,
          prescribed_sets: exercise.sets,
          reps_min: exercise.repsMin,
          reps_max: exercise.repsMax,
          rest_seconds: exercise.restSeconds,
          superset_group: exercise.supersetGroup,
          target_rir_min: exercise.targetRirMin,
          target_rir_max: exercise.targetRirMax,
          notes: exercise.notes,
        });
        exSort += 1;
      }
    }

    for (const slot of def.weekSlots) {
      await supabase.from("programme_week_slots").insert({
        user_id: user.id,
        programme_id: programme.id,
        day_of_week: slot.dayOfWeek,
        slot_type: slot.slotType,
        template_id: slot.templateCode
          ? templateIdByCode.get(slot.templateCode) ?? null
          : null,
        title: slot.title,
        sort_order: 0,
      });
    }

    const weeksToSeed = input?.weeksToSeed ?? 2;
    const weekStart = startOfWeekMonday(today);
    let seeded = 0;
    for (let week = 0; week < weeksToSeed; week += 1) {
      for (const slot of def.weekSlots) {
        const planDate = addDays(weekStart, week * 7 + slot.dayOfWeek);
        const trainingType =
          slot.slotType === "strength"
            ? "strength"
            : slot.slotType === "hiit"
              ? "hiit"
              : "rest";
        const templateId = slot.templateCode
          ? templateIdByCode.get(slot.templateCode) ?? null
          : null;
        const duration =
          slot.slotType === "strength"
            ? 45
            : slot.slotType === "hiit"
              ? 30
              : null;

        // Avoid duplicating an existing plan row for the same day+title.
        const { data: existingPlan } = await supabase
          .from("training_plan_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("plan_date", planDate)
          .eq("title", slot.title)
          .maybeSingle();
        if (existingPlan) {
          continue;
        }

        await supabase.from("training_plan_entries").insert({
          user_id: user.id,
          plan_date: planDate,
          original_plan_date: planDate,
          training_type: trainingType,
          title: slot.title,
          focus:
            slot.templateCode != null
              ? def.templates.find((t) => t.code === slot.templateCode)?.focus ??
                null
              : null,
          planned_duration_minutes: duration,
          status: "planned",
          sort_order: 0,
          workout_template_id: templateId,
        });
        seeded += 1;
      }
    }

    // Prefer programme weekly session target of 5 (3 strength + 2 HIIT).
    await supabase
      .from("profiles")
      .update({ weekly_session_target: 5 })
      .eq("id", user.id);

    const summary = await loadProgrammeSummary(user.id);
    if (!summary) {
      return { status: "error", message: "Programme activated but couldn’t be reloaded." };
    }
    return { status: "activated", programme: summary, weeksSeeded: seeded };
  } catch (error) {
    console.error("[programme] Activate failed:", error);
    return { status: "error", message: "Programme couldn’t be activated." };
  }
}
