/**
 * Deterministic helpers for daily step targets and progress.
 */

export const DEFAULT_DAILY_STEP_TARGET = 10_000;
export const MIN_DAILY_STEP_TARGET = 1_000;
export const MAX_DAILY_STEP_TARGET = 100_000;
export const MAX_DAILY_STEPS = 200_000;

export type DailyStepsRecord = {
  id: string;
  step_date: string;
  steps: number;
  updated_at: string;
};

export type StepProgress = {
  steps: number | null;
  target: number;
  remaining: number;
  fillPercent: number;
  achieved: boolean;
  hasEntry: boolean;
};

export function clampStepTarget(value: number): number {
  return Math.min(
    MAX_DAILY_STEP_TARGET,
    Math.max(MIN_DAILY_STEP_TARGET, Math.round(value)),
  );
}

export function parseStepCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    if (n < 0 || n > MAX_DAILY_STEPS) {
      return null;
    }
    return n;
  }
  if (typeof raw === "string" && raw.trim()) {
    const n = Number(raw.trim().replace(/,/g, ""));
    if (!Number.isFinite(n)) {
      return null;
    }
    return parseStepCount(n);
  }
  return null;
}

export function parseStepTarget(raw: unknown): number | null {
  const n = parseStepCount(raw);
  if (n == null) {
    return null;
  }
  if (n < MIN_DAILY_STEP_TARGET || n > MAX_DAILY_STEP_TARGET) {
    return null;
  }
  return n;
}

export function resolveDailyStepTarget(
  stored: number | null | undefined,
): number {
  if (
    typeof stored === "number" &&
    Number.isFinite(stored) &&
    stored >= MIN_DAILY_STEP_TARGET &&
    stored <= MAX_DAILY_STEP_TARGET
  ) {
    return Math.round(stored);
  }
  return DEFAULT_DAILY_STEP_TARGET;
}

export function buildStepProgress(input: {
  steps: number | null;
  target: number;
}): StepProgress {
  const target = resolveDailyStepTarget(input.target);
  const hasEntry = input.steps != null;
  const steps = hasEntry ? Math.max(0, Math.round(input.steps as number)) : null;
  const remaining =
    steps == null ? target : Math.max(0, target - steps);
  const fillPercent =
    steps == null || target <= 0
      ? 0
      : Math.min(100, Math.round((steps / target) * 100));
  return {
    steps,
    target,
    remaining,
    fillPercent,
    achieved: steps != null && steps >= target,
    hasEntry,
  };
}
