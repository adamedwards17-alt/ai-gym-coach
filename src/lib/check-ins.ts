import type {
  FeelingId,
  PlanId,
  SleepScore,
  TodayCheckIn,
} from "@/lib/today";

export type CompletedDailyCheckIn = {
  feeling: FeelingId;
  sleep: SleepScore;
  plan: PlanId;
};

export type DailyCheckInRow = {
  feeling: FeelingId;
  sleep_rating: SleepScore;
  planned_training: PlanId;
  check_in_date: string;
  coach_take: string | null;
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

export function rowToTodayCheckIn(row: DailyCheckInRow): CompletedDailyCheckIn {
  return {
    feeling: row.feeling,
    sleep: row.sleep_rating,
    plan: row.planned_training,
  };
}

export function toTodayCheckInState(
  completed: CompletedDailyCheckIn,
): TodayCheckIn {
  return {
    feeling: completed.feeling,
    sleep: completed.sleep,
    plan: completed.plan,
  };
}

export function checkInKey(checkIn: CompletedDailyCheckIn): string {
  return `${checkIn.feeling}:${checkIn.sleep}:${checkIn.plan}`;
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
