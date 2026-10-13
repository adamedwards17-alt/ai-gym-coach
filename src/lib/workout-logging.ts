/**
 * Train hub routing helpers: strength → structured Start; other → Log.
 */

import { trainingTypeOptions, type TrainingTypeId } from "@/lib/training";

export function primaryWorkoutAction(
  trainingType: string,
): "start" | "log" {
  return trainingType === "strength" ? "start" : "log";
}

/** Types offered on the lightweight activity log (no strength / no F45). */
export function activityLogTypeOptions() {
  return trainingTypeOptions.filter(
    (option) => option.id !== "strength" && !/f45/i.test(option.id),
  );
}

export function defaultActivityLogType(
  preferred?: string | null,
): TrainingTypeId {
  const options = activityLogTypeOptions();
  if (
    preferred &&
    options.some((option) => option.id === preferred)
  ) {
    return preferred as TrainingTypeId;
  }
  return "hiit";
}

export function normalizeOptionalCalories(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) {
    return null;
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
}
