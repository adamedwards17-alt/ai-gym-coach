import type {
  FeelingId,
  FeelingRating,
  PlanId,
  SleepHoursOption,
  SleepQualityId,
  SleepScore,
  TodayCheckIn,
} from "@/lib/today";
import {
  feelingRatingToFeeling,
  sleepQualityToRating,
} from "@/lib/today";

export type CompletedDailyCheckIn = {
  feeling: FeelingId;
  sleep: SleepScore;
  plan: PlanId;
  sleepHours: SleepHoursOption | null;
  sleepQuality: SleepQualityId | null;
  feelingRating: FeelingRating | null;
};

export type DailyCheckInRow = {
  feeling: FeelingId;
  sleep_rating: SleepScore;
  planned_training: PlanId;
  check_in_date: string;
  coach_take: string | null;
  sleep_hours: number | null;
  sleep_quality: SleepQualityId | null;
  feeling_rating: number | null;
};

/** Local calendar day as YYYY-MM-DD — never use UTC toISOString for this. */
export function getLocalCheckInDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidCheckInDate(value: string): boolean {
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

export function isFeelingId(value: unknown): value is FeelingId {
  return (
    value === "strong" ||
    value === "good" ||
    value === "flat" ||
    value === "tired" ||
    value === "sore"
  );
}

export function isPlanId(value: unknown): value is PlanId {
  return (
    value === "strength" ||
    value === "hiit" ||
    value === "recovery" ||
    value === "rest" ||
    value === "unsure"
  );
}

export function isSleepScore(value: unknown): value is SleepScore {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function isSleepQualityId(value: unknown): value is SleepQualityId {
  return (
    value === "bad" ||
    value === "okay" ||
    value === "good" ||
    value === "very_good"
  );
}

export function isFeelingRating(value: unknown): value is FeelingRating {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function isSleepHoursOption(value: unknown): value is SleepHoursOption {
  return value === 5 || value === 6 || value === 7 || value === 8 || value === 9;
}

function normalizeSleepHours(value: unknown): SleepHoursOption | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded >= 9) {
    return 9;
  }
  if (
    rounded === 5 ||
    rounded === 6 ||
    rounded === 7 ||
    rounded === 8
  ) {
    return rounded;
  }
  return null;
}

export function rowToTodayCheckIn(row: DailyCheckInRow): CompletedDailyCheckIn {
  const sleepQuality = isSleepQualityId(row.sleep_quality)
    ? row.sleep_quality
    : null;
  const feelingRating = isFeelingRating(row.feeling_rating)
    ? row.feeling_rating
    : null;
  const sleepHours = normalizeSleepHours(row.sleep_hours);

  return {
    feeling: row.feeling,
    sleep: row.sleep_rating,
    plan: row.planned_training,
    sleepHours,
    sleepQuality,
    feelingRating,
  };
}

export function toTodayCheckInState(
  completed: CompletedDailyCheckIn,
): TodayCheckIn {
  return {
    feeling: completed.feeling,
    sleep: completed.sleep,
    plan: completed.plan,
    sleepHours: completed.sleepHours,
    sleepQuality: completed.sleepQuality,
    feelingRating: completed.feelingRating,
  };
}

/** Legacy rows may only have sleep_rating / feeling — fill gaps for UI. */
export function hydrateCheckInForUi(checkIn: TodayCheckIn): TodayCheckIn {
  const sleepQuality =
    checkIn.sleepQuality ??
    (checkIn.sleep === 1 || checkIn.sleep === 2
      ? "bad"
      : checkIn.sleep === 3
        ? "okay"
        : checkIn.sleep === 4
          ? "good"
          : checkIn.sleep === 5
            ? "very_good"
            : null);

  const feelingRating =
    checkIn.feelingRating ??
    (checkIn.feeling === "strong"
      ? 5
      : checkIn.feeling === "good"
        ? 4
        : checkIn.feeling === "flat"
          ? 3
          : checkIn.feeling === "tired" || checkIn.feeling === "sore"
            ? 2
            : null);

  const sleep =
    checkIn.sleep ??
    (sleepQuality ? sleepQualityToRating(sleepQuality) : null);

  const feeling =
    checkIn.feeling ??
    (feelingRating ? feelingRatingToFeeling(feelingRating) : null);

  return {
    ...checkIn,
    sleepQuality,
    feelingRating,
    sleep,
    feeling,
    sleepHours: checkIn.sleepHours,
  };
}

export function checkInKey(checkIn: CompletedDailyCheckIn): string {
  return [
    checkIn.feeling,
    checkIn.sleep,
    checkIn.plan,
    checkIn.sleepHours ?? "x",
    checkIn.sleepQuality ?? "x",
    checkIn.feelingRating ?? "x",
  ].join(":");
}

export function normalizeStoredCoachTake(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatSleepHoursLabel(hours: number | null): string {
  if (hours == null) {
    return "—";
  }
  if (hours >= 9) {
    return "9h+";
  }
  if (Number.isInteger(hours)) {
    return `${hours}h`;
  }
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes === 0) {
    return `${whole}h`;
  }
  return `${whole}h ${minutes}m`;
}
