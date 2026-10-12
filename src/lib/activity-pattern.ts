/**
 * Activity-level descriptions and commute contributions for calorie estimates.
 *
 * Activity level = typical non-exercise daily movement (desk vs on-feet).
 * Cycle commute is stored separately and averaged across the week so
 * "twice a week" is never treated as every day.
 */

import type { NutritionActivityId } from "@/lib/nutrition-targets";

/** Moderate cycling ~6–7 MET ≈ ~7 kcal/min for a typical adult — approximate. */
export const CYCLE_COMMUTE_KCAL_PER_MINUTE = 7;

export type ActivityLevelOption = {
  id: NutritionActivityId;
  label: string;
  description: string;
};

export const ACTIVITY_LEVEL_DETAILS: ActivityLevelOption[] = [
  {
    id: "sedentary",
    label: "Mostly sitting",
    description:
      "Desk-based day, limited walking outside planned exercise.",
  },
  {
    id: "light",
    label: "Lightly active",
    description:
      "Some walking and movement during the day, but mostly seated.",
  },
  {
    id: "moderate",
    label: "Moderately active",
    description:
      "Regular walking or movement throughout the day, plus a consistent exercise routine.",
  },
  {
    id: "active",
    label: "Active",
    description:
      "On your feet a lot most days, or a physically demanding job with regular training.",
  },
  {
    id: "very",
    label: "Very active",
    description:
      "A physically demanding job, high daily movement, or a substantial amount of regular training.",
  },
];

export function activityLevelDescription(
  id: string | null | undefined,
): string | null {
  if (!id) {
    return null;
  }
  return ACTIVITY_LEVEL_DETAILS.find((option) => option.id === id)?.description ?? null;
}

export function activityLevelLabel(
  id: string | null | undefined,
): string | null {
  if (!id) {
    return null;
  }
  return ACTIVITY_LEVEL_DETAILS.find((option) => option.id === id)?.label ?? id;
}

export type ActivityPatternInput = {
  activityLevel: string | null;
  cycleCommuteDaysPerWeek: number | null;
  cycleCommuteMinutes: number | null;
  activityPatternNotes?: string | null;
};

/**
 * Average daily kcal from cycle commuting.
 * days=2, minutes=20 → (2 * 20 * 7) / 7 = 40 kcal/day — not 7× that.
 */
export function dailyCycleCommuteKcal(input: {
  daysPerWeek: number | null | undefined;
  minutesPerRide: number | null | undefined;
}): number {
  const days = input.daysPerWeek;
  const minutes = input.minutesPerRide;
  if (
    days == null ||
    minutes == null ||
    !Number.isFinite(days) ||
    !Number.isFinite(minutes) ||
    days <= 0 ||
    minutes <= 0
  ) {
    return 0;
  }
  const clampedDays = Math.min(7, Math.max(0, Math.round(days)));
  const clampedMinutes = Math.min(180, Math.max(1, Math.round(minutes)));
  return Math.round(
    (clampedDays * clampedMinutes * CYCLE_COMMUTE_KCAL_PER_MINUTE) / 7,
  );
}

export function describeActivityAssumptions(
  pattern: ActivityPatternInput,
): string[] {
  const lines: string[] = [];
  const label = activityLevelLabel(pattern.activityLevel);
  const description = activityLevelDescription(pattern.activityLevel);
  if (label) {
    lines.push(
      description
        ? `Base activity: ${label} — ${description}`
        : `Base activity: ${label}`,
    );
  }
  const days = pattern.cycleCommuteDaysPerWeek;
  const minutes = pattern.cycleCommuteMinutes;
  if (days != null && days > 0) {
    const daily = dailyCycleCommuteKcal({
      daysPerWeek: days,
      minutesPerRide: minutes ?? 20,
    });
    lines.push(
      `Cycle commute: ${days} day${days === 1 ? "" : "s"}/week` +
        (minutes != null ? ` (~${minutes} min/ride)` : "") +
        ` ≈ +${daily} kcal/day averaged (not counted as every day).`,
    );
  } else if (days === 0) {
    lines.push("Cycle commute: none recorded.");
  }
  if (pattern.activityPatternNotes?.trim()) {
    lines.push(`Notes: ${pattern.activityPatternNotes.trim()}`);
  }
  return lines;
}
