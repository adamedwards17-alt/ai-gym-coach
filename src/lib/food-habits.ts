/**
 * Deterministic recurring-food habit detection for Coach Moments.
 * No paid AI — uses local nutrition history only.
 */

import { normalizeFoodText } from "@/lib/food-naming";
import type { MealTypeId } from "@/lib/nutrition";

export type HabitHistoryEntry = {
  logged_date: string;
  description: string;
  display_name?: string | null;
  search_aliases?: string[] | null;
  meal_type: MealTypeId | null;
  calories_estimated: number | null;
  protein_g_estimated?: number | null;
  carbs_g_estimated?: number | null;
  fat_g_estimated?: number | null;
  created_at: string;
};

export type DetectedHabit = {
  /** Stable key for suppressions / dedupe. */
  key: string;
  label: string;
  /** Canonical description to re-log if confirmed. */
  description: string;
  mealType: MealTypeId | null;
  /** Typical local hour (0–23). */
  typicalHour: number;
  /** Days observed in the lookback window. */
  daysObserved: number;
  /** True when calories are negligible (e.g. black coffee). */
  negligibleCalories: boolean;
  /** Sample entry with macros if available (for confirmation logging). */
  sampleCalories: number | null;
  sampleProteinG: number | null;
  sampleCarbsG: number | null;
  sampleFatG: number | null;
};

export type HabitDetectionConfig = {
  lookbackDays: number;
  /** Minimum distinct days the food must appear. */
  minDays: number;
  /** Hour window ± half-width around typical hour. */
  hourWindow: number;
  /** Calories at/under this are treated as negligible (no nag). */
  negligibleCalorieCeiling: number;
};

export const DEFAULT_HABIT_CONFIG: HabitDetectionConfig = {
  lookbackDays: 7,
  minDays: 4,
  hourWindow: 2,
  negligibleCalorieCeiling: 15,
};

function hourFromCreatedAt(createdAt: string): number | null {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getHours();
}

function habitKey(label: string, typicalHour: number): string {
  return `${normalizeFoodText(label)}@${typicalHour}`;
}

function canonicalLabel(entry: HabitHistoryEntry): string {
  const name = entry.display_name?.trim();
  if (name) {
    return name;
  }
  return entry.description.trim().slice(0, 48);
}

/**
 * Detect recurring foods in similar local time windows across recent days.
 */
export function detectFoodHabits(input: {
  entries: HabitHistoryEntry[];
  localDate: string;
  now: Date;
  config?: Partial<HabitDetectionConfig>;
  stoppedKeys?: string[];
  /** Habit keys already prompted today (client session / server). */
  promptedTodayKeys?: string[];
  /** Descriptions / display names already logged today. */
  loggedTodayLabels?: string[];
}): DetectedHabit[] {
  const config = { ...DEFAULT_HABIT_CONFIG, ...input.config };
  const stopped = new Set(input.stoppedKeys ?? []);
  const prompted = new Set(input.promptedTodayKeys ?? []);
  const loggedToday = new Set(
    (input.loggedTodayLabels ?? []).map(normalizeFoodText),
  );

  // Group by normalized label within hour buckets.
  type Bucket = {
    label: string;
    description: string;
    mealType: MealTypeId | null;
    hours: number[];
    days: Set<string>;
    calories: number[];
    sample: HabitHistoryEntry;
  };

  const buckets = new Map<string, Bucket>();

  for (const entry of input.entries) {
    if (entry.logged_date >= input.localDate) {
      continue;
    }
    const hour = hourFromCreatedAt(entry.created_at);
    if (hour == null) {
      continue;
    }
    const label = canonicalLabel(entry);
    const norm = normalizeFoodText(label);
    if (norm.length < 2) {
      continue;
    }
    // Coarse hour bucket for grouping (morning / mid / etc. via typical hour).
    const hourBucket = Math.round(hour / config.hourWindow) * config.hourWindow;
    const mapKey = `${norm}|${hourBucket}`;
    const existing = buckets.get(mapKey);
    if (!existing) {
      buckets.set(mapKey, {
        label,
        description: entry.description,
        mealType: entry.meal_type,
        hours: [hour],
        days: new Set([entry.logged_date]),
        calories: [
          entry.calories_estimated == null ? -1 : entry.calories_estimated,
        ],
        sample: entry,
      });
    } else {
      existing.hours.push(hour);
      existing.days.add(entry.logged_date);
      existing.calories.push(
        entry.calories_estimated == null ? -1 : entry.calories_estimated,
      );
      if (
        existing.sample.calories_estimated == null &&
        entry.calories_estimated != null
      ) {
        existing.sample = entry;
        existing.description = entry.description;
      }
    }
  }

  const currentHour = input.now.getHours();
  const habits: DetectedHabit[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.days.size < config.minDays) {
      continue;
    }
    const typicalHour = Math.round(
      bucket.hours.reduce((a, b) => a + b, 0) / bucket.hours.length,
    );
    if (Math.abs(currentHour - typicalHour) > config.hourWindow) {
      continue;
    }

    const knownCalories = bucket.calories.filter((c) => c >= 0);
    const avgCalories =
      knownCalories.length > 0
        ? knownCalories.reduce((a, b) => a + b, 0) / knownCalories.length
        : null;
    const negligible =
      avgCalories != null && avgCalories <= config.negligibleCalorieCeiling;

    const key = habitKey(bucket.label, typicalHour);
    if (stopped.has(key) || prompted.has(key)) {
      continue;
    }
    if (loggedToday.has(normalizeFoodText(bucket.label))) {
      continue;
    }
    // Also match aliases from sample.
    const aliases = [
      bucket.label,
      bucket.description,
      ...(bucket.sample.search_aliases ?? []),
    ].map(normalizeFoodText);
    if (aliases.some((alias) => loggedToday.has(alias))) {
      continue;
    }

    habits.push({
      key,
      label: bucket.label,
      description: bucket.description,
      mealType: bucket.mealType,
      typicalHour,
      daysObserved: bucket.days.size,
      negligibleCalories: negligible,
      sampleCalories: bucket.sample.calories_estimated,
      sampleProteinG: bucket.sample.protein_g_estimated ?? null,
      sampleCarbsG: bucket.sample.carbs_g_estimated ?? null,
      sampleFatG: bucket.sample.fat_g_estimated ?? null,
    });
  }

  // Prefer non-negligible, most frequent first.
  habits.sort((a, b) => {
    if (a.negligibleCalories !== b.negligibleCalories) {
      return a.negligibleCalories ? 1 : -1;
    }
    return b.daysObserved - a.daysObserved;
  });

  return habits;
}

export function habitPromptTitle(habit: DetectedHabit): string {
  return `Did you have your usual ${habit.label.toLowerCase()} today?`;
}
