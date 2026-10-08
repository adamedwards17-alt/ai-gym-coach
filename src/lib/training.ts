export type TrainingTypeId =
  | "strength"
  | "hiit"
  | "cardio"
  | "sport"
  | "recovery"
  | "other";

export type DurationOptionId = "15" | "30" | "45" | "60" | "75" | "skip";

export type TrainingSessionDraft = {
  trainingType: TrainingTypeId | null;
  title: string | null;
  durationMinutes: number | null;
  durationSkipped: boolean;
};

export type TrainingSessionRecord = {
  id: string;
  session_date: string;
  training_type: TrainingTypeId;
  title: string;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
};

export const trainingTypeOptions: { id: TrainingTypeId; label: string }[] = [
  { id: "strength", label: "Strength" },
  { id: "hiit", label: "F45 / HIIT" },
  { id: "cardio", label: "Cardio" },
  { id: "sport", label: "Sport" },
  { id: "recovery", label: "Recovery" },
  { id: "other", label: "Other" },
];

export const durationOptions: { id: DurationOptionId; label: string }[] = [
  { id: "15", label: "15 min" },
  { id: "30", label: "30 min" },
  { id: "45", label: "45 min" },
  { id: "60", label: "60 min" },
  { id: "75", label: "75+ min" },
  { id: "skip", label: "Skip" },
];

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

export function labelForTrainingType(id: TrainingTypeId): string {
  return trainingTypeOptions.find((option) => option.id === id)?.label ?? id;
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
