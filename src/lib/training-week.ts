/**
 * Monday–Sunday local week helpers and weekly training progress.
 */

import type {
  PlanTrainingTypeId,
  TrainingPlanEntryRecord,
  TrainingSessionRecord,
} from "@/lib/training";

export type WeekDay = {
  date: string;
  weekdayLabel: string;
  dayNumber: number;
  isToday: boolean;
};

export type WeeklyTrainingProgress = {
  weekStart: string;
  weekEnd: string;
  plannedSessions: number;
  completedSessions: number;
  restDays: number;
  unplannedDays: number;
  target: number;
  fillPercent: number;
  plannedDurationMinutes: number;
  completedDurationMinutes: number;
  achieved: boolean;
};

function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLocalDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Monday of the local week containing `localDate` (YYYY-MM-DD). */
export function startOfWeekMonday(localDate: string): string {
  const date = parseLocalDate(localDate);
  const day = date.getDay(); // 0 Sun … 6 Sat
  const offset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offset);
  return formatLocalDate(date);
}

export function addDays(localDate: string, days: number): string {
  const date = parseLocalDate(localDate);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export function endOfWeekSunday(localDate: string): string {
  return addDays(startOfWeekMonday(localDate), 6);
}

export function buildWeekDays(input: {
  localDate: string;
  today?: string;
}): WeekDay[] {
  const monday = startOfWeekMonday(input.localDate);
  const today = input.today ?? input.localDate;
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(monday, i);
    const parsed = parseLocalDate(date);
    days.push({
      date,
      weekdayLabel: new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
      }).format(parsed),
      dayNumber: parsed.getDate(),
      isToday: date === today,
    });
  }
  return days;
}

export function isTrainingSessionType(type: PlanTrainingTypeId): boolean {
  return type !== "rest";
}

/**
 * Weekly progress: rest days never count as planned or missed sessions.
 * Completed count prefers plan completions; unplanned logged sessions on
 * days without a plan entry also count toward completed (once per day max
 * for plan association — session count uses unique session ids).
 */
export function buildWeeklyTrainingProgress(input: {
  localDate: string;
  target: number;
  planEntries: TrainingPlanEntryRecord[];
  sessions: TrainingSessionRecord[];
}): WeeklyTrainingProgress {
  const weekStart = startOfWeekMonday(input.localDate);
  const weekEnd = endOfWeekSunday(input.localDate);

  const inWeek = (date: string) => date >= weekStart && date <= weekEnd;

  const weekPlans = input.planEntries.filter((entry) => inWeek(entry.plan_date));
  const weekSessions = input.sessions.filter((session) =>
    inWeek(session.session_date),
  );

  const plannedSessionEntries = weekPlans.filter((entry) =>
    isTrainingSessionType(entry.training_type),
  );
  const restDays = weekPlans.filter(
    (entry) => entry.training_type === "rest",
  ).length;

  const plannedSessions = plannedSessionEntries.length;
  const completedFromPlan = plannedSessionEntries.filter(
    (entry) => entry.status === "completed",
  ).length;

  // Unplanned workouts: sessions on dates without a non-rest plan entry.
  const plannedDates = new Set(
    plannedSessionEntries.map((entry) => entry.plan_date),
  );
  const linkedSessionIds = new Set(
    plannedSessionEntries
      .map((entry) => entry.training_session_id)
      .filter((id): id is string => typeof id === "string"),
  );

  let unplannedCompleted = 0;
  const seenUnplannedDates = new Set<string>();
  for (const session of weekSessions) {
    if (linkedSessionIds.has(session.id)) {
      continue;
    }
    if (plannedDates.has(session.session_date)) {
      // Session on a planned day but not linked — still counts once via plan
      // completion when marked complete; avoid double-count here.
      continue;
    }
    if (seenUnplannedDates.has(session.session_date)) {
      continue;
    }
    seenUnplannedDates.add(session.session_date);
    unplannedCompleted += 1;
  }

  const completedSessions = completedFromPlan + unplannedCompleted;

  const plannedDurationMinutes = plannedSessionEntries.reduce(
    (sum, entry) => sum + (entry.planned_duration_minutes ?? 0),
    0,
  );
  const completedDurationMinutes = weekSessions.reduce(
    (sum, session) => sum + (session.duration_minutes ?? 0),
    0,
  );

  const target = Math.max(1, Math.round(input.target));
  const fillPercent = Math.min(
    100,
    Math.round((completedSessions / target) * 100),
  );

  const occupiedDates = new Set(weekPlans.map((entry) => entry.plan_date));
  const unplannedDays = 7 - occupiedDates.size;

  return {
    weekStart,
    weekEnd,
    plannedSessions,
    completedSessions,
    restDays,
    unplannedDays,
    target,
    fillPercent,
    plannedDurationMinutes,
    completedDurationMinutes,
    achieved: completedSessions >= target,
  };
}

export function todayPlanStatus(input: {
  plan: TrainingPlanEntryRecord | null;
  hasSessionToday: boolean;
}): "planned" | "completed" | "rest" | "unplanned" {
  if (input.plan?.training_type === "rest") {
    return "rest";
  }
  if (input.plan?.status === "completed" || input.hasSessionToday) {
    return "completed";
  }
  if (input.plan) {
    return "planned";
  }
  return "unplanned";
}
