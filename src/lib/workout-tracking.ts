/**
 * Types for exercise-level workout tracking.
 * Keep scripts/verify-exercise-workout-tracking.mjs in sync with progression helpers.
 */

import type { WeightConvention } from "@/lib/progression";

export type ExerciseRecord = {
  id: string;
  slug: string;
  name: string;
  primary_muscles: string[];
  equipment: string | null;
  weight_convention: WeightConvention;
  default_increment_kg: number;
  notes: string | null;
};

export type TemplateExerciseRecord = {
  id: string;
  exercise_id: string;
  sort_order: number;
  prescribed_sets: number;
  reps_min: number;
  reps_max: number;
  rest_seconds: number;
  superset_group: string | null;
  target_rir_min: number | null;
  target_rir_max: number | null;
  notes: string | null;
  exercise: ExerciseRecord;
};

export type WorkoutTemplateRecord = {
  id: string;
  code: string;
  name: string;
  focus: string | null;
  estimated_duration_minutes: number | null;
  sort_order: number;
  exercises: TemplateExerciseRecord[];
};

export type TrainingPhaseRecord = {
  id: string;
  slug: string;
  name: string;
  kind: "muscle_building" | "fat_loss" | "other";
  status: "active" | "upcoming" | "completed";
  start_date: string | null;
  end_date: string | null;
  duration_weeks: number | null;
  notes: string | null;
  sort_order: number;
};

export type TrainingProgrammeSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  activePhase: TrainingPhaseRecord | null;
  upcomingPhase: TrainingPhaseRecord | null;
  templates: Array<{
    id: string;
    code: string;
    name: string;
    focus: string | null;
  }>;
};

export type WorkoutSetLogRecord = {
  id: string;
  training_session_id: string;
  exercise_id: string;
  template_exercise_id: string | null;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rir: number | null;
  effort: string | null;
  completed: boolean;
  skipped: boolean;
  pain_reported: boolean;
  pain_notes: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SessionStatus = "in_progress" | "completed" | "abandoned";

export function isWeightConvention(value: unknown): value is WeightConvention {
  return (
    value === "per_dumbbell" ||
    value === "total" ||
    value === "bodyweight" ||
    value === "assisted"
  );
}

export function toExerciseRecord(
  row: Record<string, unknown>,
): ExerciseRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.slug !== "string" ||
    typeof row.name !== "string" ||
    !isWeightConvention(row.weight_convention)
  ) {
    return null;
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    primary_muscles: Array.isArray(row.primary_muscles)
      ? row.primary_muscles.filter((v): v is string => typeof v === "string")
      : [],
    equipment: typeof row.equipment === "string" ? row.equipment : null,
    weight_convention: row.weight_convention,
    default_increment_kg: Number(row.default_increment_kg) || 2.5,
    notes: typeof row.notes === "string" ? row.notes : null,
  };
}
