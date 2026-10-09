/**
 * Client-side session helpers so habit Coach Moments aren't repeated
 * multiple times on the same local calendar day.
 */

const STORAGE_PREFIX = "aigc:habit-prompted:";

function storageKey(localDate: string): string {
  return `${STORAGE_PREFIX}${localDate}`;
}

export function readPromptedHabitKeys(localDate: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    // localStorage so a page refresh doesn't re-prompt the same habit today.
    const raw = window.localStorage.getItem(storageKey(localDate));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

export function markHabitPrompted(localDate: string, habitKey: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const existing = new Set(readPromptedHabitKeys(localDate));
  existing.add(habitKey);
  try {
    window.localStorage.setItem(
      storageKey(localDate),
      JSON.stringify(Array.from(existing)),
    );
  } catch {
    // Ignore quota / private-mode failures — prompts may repeat this session.
  }
}
