/**
 * Daily activity level + optional commute/transport pattern for calorie estimates.
 *
 * Activity level = typical non-exercise daily movement (desk vs on-feet).
 * Commute entries are optional, method-specific, and averaged across the week.
 * Unset fields contribute nothing — never invent a commute.
 */

import type { NutritionActivityId } from "@/lib/nutrition-targets";

export type CommuteMethodId =
  | "walking"
  | "cycling"
  | "e_scooter"
  | "public_transport"
  | "driving"
  | "other";

export type CommuteSituationId =
  | "work_from_home"
  | "no_regular_commute"
  | "commutes";

export type CommutePatternEntry = {
  method: CommuteMethodId;
  daysPerWeek: number;
  /** Typical one-way duration in minutes. */
  minutesOneWay: number | null;
};

export type ActivityLevelOption = {
  id: NutritionActivityId;
  label: string;
  description: string;
};

/**
 * Approximate extra kcal/min for one-way active travel.
 * Passive and public transport are near zero (not treated as exercise).
 * Values are coaching estimates, not lab-grade MET tables.
 */
export const COMMUTE_KCAL_PER_MINUTE: Record<CommuteMethodId, number> = {
  walking: 4,
  cycling: 7,
  e_scooter: 2,
  public_transport: 0.5,
  driving: 0,
  other: 3,
};

export const COMMUTE_METHOD_OPTIONS: Array<{
  id: CommuteMethodId;
  label: string;
  /** Whether duration materially affects calorie estimates. */
  needsDuration: boolean;
}> = [
  { id: "walking", label: "Walking", needsDuration: true },
  { id: "cycling", label: "Cycling", needsDuration: true },
  { id: "e_scooter", label: "E-scooter", needsDuration: true },
  { id: "public_transport", label: "Public transport", needsDuration: false },
  { id: "driving", label: "Driving", needsDuration: false },
  { id: "other", label: "Other", needsDuration: true },
];

export const COMMUTE_SITUATION_OPTIONS: Array<{
  id: CommuteSituationId;
  label: string;
  description: string;
}> = [
  {
    id: "work_from_home",
    label: "Work from home",
    description: "No regular travel to a workplace.",
  },
  {
    id: "no_regular_commute",
    label: "No regular commute",
    description: "Varied days, or commute isn’t a useful pattern.",
  },
  {
    id: "commutes",
    label: "I commute",
    description: "Regular travel to work or study — pick the methods you use.",
  },
];

/** Daily movement outside planned workouts (strength/HIIT etc.). */
export const ACTIVITY_LEVEL_DETAILS: ActivityLevelOption[] = [
  {
    id: "sedentary",
    label: "Mostly sedentary",
    description:
      "Mostly sitting during the day, limited walking outside planned exercise.",
  },
  {
    id: "light",
    label: "Mixed sitting and movement",
    description:
      "A mix of sitting and walking or light movement through the day.",
  },
  {
    id: "moderate",
    label: "Mostly on your feet",
    description:
      "Regularly on your feet or walking during the day, outside gym sessions.",
  },
  {
    id: "active",
    label: "Physically demanding",
    description:
      "A job or day that keeps you moving a lot, separate from planned workouts.",
  },
  {
    id: "very",
    label: "Very physically demanding",
    description:
      "High daily physical work or movement most days, beyond planned training.",
  },
];

export function isCommuteMethodId(value: unknown): value is CommuteMethodId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(COMMUTE_KCAL_PER_MINUTE, value)
  );
}

export function isCommuteSituationId(
  value: unknown,
): value is CommuteSituationId {
  return (
    value === "work_from_home" ||
    value === "no_regular_commute" ||
    value === "commutes"
  );
}

export function activityLevelDescription(
  id: string | null | undefined,
): string | null {
  if (!id) {
    return null;
  }
  return (
    ACTIVITY_LEVEL_DETAILS.find((option) => option.id === id)?.description ??
    null
  );
}

export function activityLevelLabel(
  id: string | null | undefined,
): string | null {
  if (!id) {
    return null;
  }
  return ACTIVITY_LEVEL_DETAILS.find((option) => option.id === id)?.label ?? id;
}

export function commuteMethodLabel(method: CommuteMethodId): string {
  return (
    COMMUTE_METHOD_OPTIONS.find((option) => option.id === method)?.label ??
    method
  );
}

/**
 * Parse commute_pattern JSON from the database.
 * Invalid entries are dropped — never invent data.
 */
export function parseCommutePattern(raw: unknown): CommutePatternEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const entries: CommutePatternEntry[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (!isCommuteMethodId(record.method)) {
      continue;
    }
    const daysRaw = record.daysPerWeek ?? record.days_per_week;
    if (typeof daysRaw !== "number" || !Number.isFinite(daysRaw)) {
      continue;
    }
    const days = Math.round(daysRaw);
    if (days < 1 || days > 7) {
      continue;
    }
    const minutesRaw = record.minutesOneWay ?? record.minutes_one_way;
    let minutesOneWay: number | null = null;
    if (typeof minutesRaw === "number" && Number.isFinite(minutesRaw)) {
      const rounded = Math.round(minutesRaw);
      if (rounded >= 1 && rounded <= 180) {
        minutesOneWay = rounded;
      }
    }
    entries.push({
      method: record.method,
      daysPerWeek: days,
      minutesOneWay,
    });
  }
  return entries;
}

/**
 * Build a commute pattern from legacy cycle-only columns when the JSON
 * pattern is empty. Preserves existing users without inventing new data.
 */
export function commutePatternFromLegacyCycle(input: {
  daysPerWeek: number | null | undefined;
  minutesOneWay: number | null | undefined;
}): CommutePatternEntry[] {
  const days = input.daysPerWeek;
  if (days == null || !Number.isFinite(days) || days <= 0) {
    return [];
  }
  const minutes =
    input.minutesOneWay != null &&
    Number.isFinite(input.minutesOneWay) &&
    input.minutesOneWay > 0
      ? Math.min(180, Math.round(input.minutesOneWay))
      : null;
  return [
    {
      method: "cycling",
      daysPerWeek: Math.min(7, Math.max(1, Math.round(days))),
      minutesOneWay: minutes,
    },
  ];
}

export function resolveCommutePattern(input: {
  commutePattern?: unknown;
  cycleCommuteDaysPerWeek?: number | null;
  cycleCommuteMinutes?: number | null;
}): CommutePatternEntry[] {
  const parsed = parseCommutePattern(input.commutePattern);
  if (parsed.length > 0) {
    return parsed;
  }
  return commutePatternFromLegacyCycle({
    daysPerWeek: input.cycleCommuteDaysPerWeek,
    minutesOneWay: input.cycleCommuteMinutes,
  });
}

/** Sync legacy cycle columns from a structured pattern (backward compatible). */
export function legacyCycleFieldsFromPattern(pattern: CommutePatternEntry[]): {
  cycleCommuteDaysPerWeek: number | null;
  cycleCommuteMinutes: number | null;
} {
  const cycling = pattern.find((entry) => entry.method === "cycling");
  if (!cycling) {
    return { cycleCommuteDaysPerWeek: null, cycleCommuteMinutes: null };
  }
  return {
    cycleCommuteDaysPerWeek: cycling.daysPerWeek,
    cycleCommuteMinutes: cycling.minutesOneWay,
  };
}

/**
 * Average daily kcal from one commute entry.
 * days=2, minutes=20, cycling → (2 * 20 * 7) / 7 = 40 — not treated as daily.
 * Methods with 0 kcal/min contribute nothing even if recorded.
 * Missing duration for an active method contributes nothing (do not invent).
 */
export function dailyCommuteEntryKcal(entry: CommutePatternEntry): number {
  const rate = COMMUTE_KCAL_PER_MINUTE[entry.method];
  if (rate <= 0) {
    return 0;
  }
  if (
    entry.minutesOneWay == null ||
    !Number.isFinite(entry.minutesOneWay) ||
    entry.minutesOneWay <= 0 ||
    entry.daysPerWeek <= 0
  ) {
    return 0;
  }
  const days = Math.min(7, Math.max(0, Math.round(entry.daysPerWeek)));
  const minutes = Math.min(180, Math.max(1, Math.round(entry.minutesOneWay)));
  return Math.round((days * minutes * rate) / 7);
}

export function dailyCommutePatternKcal(
  pattern: CommutePatternEntry[],
): number {
  return pattern.reduce((sum, entry) => sum + dailyCommuteEntryKcal(entry), 0);
}

/** @deprecated Prefer dailyCommutePatternKcal / resolveCommutePattern. */
export const CYCLE_COMMUTE_KCAL_PER_MINUTE = COMMUTE_KCAL_PER_MINUTE.cycling;

/** @deprecated Prefer dailyCommuteEntryKcal with a cycling entry. */
export function dailyCycleCommuteKcal(input: {
  daysPerWeek: number | null | undefined;
  minutesPerRide: number | null | undefined;
}): number {
  return dailyCommutePatternKcal(
    commutePatternFromLegacyCycle({
      daysPerWeek: input.daysPerWeek,
      minutesOneWay: input.minutesPerRide,
    }),
  );
}

export type ActivityPatternInput = {
  activityLevel: string | null;
  commuteSituation?: CommuteSituationId | null;
  commutePattern?: CommutePatternEntry[];
  /** Legacy fallback when commutePattern is empty. */
  cycleCommuteDaysPerWeek?: number | null;
  cycleCommuteMinutes?: number | null;
  activityPatternNotes?: string | null;
};

export function describeActivityAssumptions(
  pattern: ActivityPatternInput,
): string[] {
  const lines: string[] = [];
  const label = activityLevelLabel(pattern.activityLevel);
  const description = activityLevelDescription(pattern.activityLevel);
  if (label) {
    lines.push(
      description
        ? `Daily movement (outside planned workouts): ${label} — ${description}`
        : `Daily movement (outside planned workouts): ${label}`,
    );
  }

  if (pattern.commuteSituation === "work_from_home") {
    lines.push("Commute: works from home — no regular workplace travel.");
  } else if (pattern.commuteSituation === "no_regular_commute") {
    lines.push("Commute: no regular commute pattern recorded.");
  }

  const entries = resolveCommutePattern({
    commutePattern: pattern.commutePattern,
    cycleCommuteDaysPerWeek: pattern.cycleCommuteDaysPerWeek,
    cycleCommuteMinutes: pattern.cycleCommuteMinutes,
  });

  if (entries.length > 0) {
    for (const entry of entries) {
      const daily = dailyCommuteEntryKcal(entry);
      const duration =
        entry.minutesOneWay != null
          ? ` (~${entry.minutesOneWay} min one way)`
          : "";
      const kcalNote =
        daily > 0
          ? ` ≈ +${daily} kcal/day averaged`
          : rateNote(entry.method);
      lines.push(
        `${commuteMethodLabel(entry.method)}: ${entry.daysPerWeek} day${
          entry.daysPerWeek === 1 ? "" : "s"
        }/week${duration}${kcalNote}`,
      );
    }
  } else if (pattern.commuteSituation === "commutes") {
    lines.push(
      "Commute: marked as commuting, but no methods/durations saved yet.",
    );
  }

  if (pattern.activityPatternNotes?.trim()) {
    lines.push(`Notes: ${pattern.activityPatternNotes.trim()}`);
  }
  return lines;
}

function rateNote(method: CommuteMethodId): string {
  if (COMMUTE_KCAL_PER_MINUTE[method] <= 0) {
    return " (not counted as active travel for calories)";
  }
  return " (duration needed before this adds to calorie estimates)";
}
