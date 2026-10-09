export type TrainingTypeId =
  | "strength"
  | "hiit"
  | "cardio"
  | "sport"
  | "recovery"
  | "other";

/** Plan categories include Rest in addition to logged session types. */
export type PlanTrainingTypeId = TrainingTypeId | "rest";

export type TrainingIntensityId =
  | "easy"
  | "moderate"
  | "hard"
  | "very_hard";

export type PlanEntryStatus =
  | "planned"
  | "completed"
  | "skipped"
  | "rescheduled";

export type DurationOptionId = "15" | "30" | "45" | "60" | "75" | "skip";

export type TrainingSessionDraft = {
  trainingType: TrainingTypeId | null;
  title: string | null;
  durationMinutes: number | null;
  durationSkipped: boolean;
  intensity: TrainingIntensityId | null;
  caloriesBurned: number | null;
};

export type StrengthExerciseDetail = {
  exercise: string;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
};

export type TrainingSessionRecord = {
  id: string;
  session_date: string;
  training_type: TrainingTypeId;
  title: string;
  duration_minutes: number | null;
  notes: string | null;
  intensity: TrainingIntensityId | null;
  calories_burned: number | null;
  strength_details: StrengthExerciseDetail[] | null;
  created_at: string;
};

export type TrainingPlanEntryRecord = {
  id: string;
  plan_date: string;
  training_type: PlanTrainingTypeId;
  title: string;
  focus: string | null;
  planned_duration_minutes: number | null;
  status: PlanEntryStatus;
  training_session_id: string | null;
  original_plan_date: string | null;
  skip_reason: string | null;
  skip_notes: string | null;
  sort_order: number;
  rescheduled_from_id: string | null;
  created_at: string;
};

export const trainingTypeOptions: { id: TrainingTypeId; label: string }[] = [
  { id: "strength", label: "Strength" },
  { id: "hiit", label: "HIIT" },
  { id: "cardio", label: "Cardio" },
  { id: "sport", label: "Sport" },
  { id: "recovery", label: "Recovery" },
  { id: "other", label: "Other" },
];

export const planTrainingTypeOptions: {
  id: PlanTrainingTypeId;
  label: string;
}[] = [
  ...trainingTypeOptions,
  { id: "rest", label: "Rest" },
];

export const intensityOptions: { id: TrainingIntensityId; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "moderate", label: "Moderate" },
  { id: "hard", label: "Hard" },
  { id: "very_hard", label: "Very hard" },
];

export const durationOptions: { id: DurationOptionId; label: string }[] = [
  { id: "15", label: "15 min" },
  { id: "30", label: "30 min" },
  { id: "45", label: "45 min" },
  { id: "60", label: "60 min" },
  { id: "75", label: "75+ min" },
  { id: "skip", label: "Skip" },
];

export const DEFAULT_WEEKLY_SESSION_TARGET = 3;
export const MIN_WEEKLY_SESSION_TARGET = 1;
export const MAX_WEEKLY_SESSION_TARGET = 14;

/** Local calendar day as YYYY-MM-DD — never use UTC toISOString for this. */
export function getLocalSessionDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidSessionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isTrainingTypeId(value: unknown): value is TrainingTypeId {
  return (
    value === "strength" ||
    value === "hiit" ||
    value === "cardio" ||
    value === "sport" ||
    value === "recovery" ||
    value === "other"
  );
}

export function isPlanTrainingTypeId(
  value: unknown,
): value is PlanTrainingTypeId {
  return value === "rest" || isTrainingTypeId(value);
}

export function isTrainingIntensityId(
  value: unknown,
): value is TrainingIntensityId {
  return (
    value === "easy" ||
    value === "moderate" ||
    value === "hard" ||
    value === "very_hard"
  );
}

export function isPlanEntryStatus(value: unknown): value is PlanEntryStatus {
  return (
    value === "planned" ||
    value === "completed" ||
    value === "skipped" ||
    value === "rescheduled"
  );
}

export function parseStrengthDetails(
  raw: unknown,
): StrengthExerciseDetail[] | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw === "string") {
    try {
      return parseStrengthDetails(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const details: StrengthExerciseDetail[] = [];
  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const exercise =
      typeof record.exercise === "string"
        ? record.exercise.trim().slice(0, 80)
        : "";
    if (!exercise) {
      continue;
    }
    const sets =
      typeof record.sets === "number" && Number.isFinite(record.sets)
        ? Math.max(0, Math.round(record.sets))
        : null;
    const reps =
      typeof record.reps === "number" && Number.isFinite(record.reps)
        ? Math.max(0, Math.round(record.reps))
        : null;
    const weightRaw = record.weightKg ?? record.weight_kg;
    const weightKg =
      typeof weightRaw === "number" && Number.isFinite(weightRaw)
        ? Math.max(0, Math.round(weightRaw * 10) / 10)
        : null;
    details.push({ exercise, sets, reps, weightKg });
  }
  return details.length > 0 ? details : null;
}

export function labelForTrainingType(
  id: TrainingTypeId | PlanTrainingTypeId,
): string {
  return (
    planTrainingTypeOptions.find((option) => option.id === id)?.label ?? id
  );
}

export function labelForIntensity(id: TrainingIntensityId | null): string {
  if (!id) {
    return "Intensity skipped";
  }
  return intensityOptions.find((option) => option.id === id)?.label ?? id;
}

export function durationMinutesFromOption(
  id: DurationOptionId,
): number | null {
  if (id === "skip") {
    return null;
  }
  return Number(id);
}

export function labelForDuration(minutes: number | null): string {
  if (minutes === null) {
    return "Duration skipped";
  }
  if (minutes >= 75) {
    return "75+ min";
  }
  return `${minutes} min`;
}

export function formatSessionDateLabel(sessionDate: string): string {
  const today = getLocalSessionDate();
  if (sessionDate === today) {
    return "Today";
  }

  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = getLocalSessionDate(yesterdayDate);
  if (sessionDate === yesterday) {
    return "Yesterday";
  }

  const [year, month, day] = sessionDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function isDraftReadyToSave(draft: TrainingSessionDraft): boolean {
  return (
    draft.trainingType !== null &&
    typeof draft.title === "string" &&
    draft.title.trim().length > 0 &&
    (draft.durationSkipped || draft.durationMinutes !== null)
  );
}

/**
 * Map onboarding training_frequency ids to a sensible weekly session target.
 */
export function defaultWeeklySessionTargetFromFrequency(
  frequency: string | null | undefined,
): number {
  switch (frequency) {
    case "0-1":
      return 1;
    case "2-3":
      return 3;
    case "4-5":
      return 4;
    case "6+":
      return 6;
    default:
      return DEFAULT_WEEKLY_SESSION_TARGET;
  }
}

export function resolveWeeklySessionTarget(
  stored: number | null | undefined,
  frequency: string | null | undefined,
): number {
  if (
    typeof stored === "number" &&
    Number.isFinite(stored) &&
    stored >= MIN_WEEKLY_SESSION_TARGET &&
    stored <= MAX_WEEKLY_SESSION_TARGET
  ) {
    return Math.round(stored);
  }
  return defaultWeeklySessionTargetFromFrequency(frequency);
}

export function parseCaloriesBurned(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const n =
    typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) {
    return null;
  }
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 5000) {
    return null;
  }
  return rounded;
}
