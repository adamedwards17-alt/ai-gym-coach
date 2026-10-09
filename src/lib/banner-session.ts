/**
 * Client-side dismissal of Today action banners for the local calendar day.
 * Mirrors habit-session: dismiss for today only, not forever.
 */

const STORAGE_PREFIX = "aigc:banner-dismissed:";

function storageKey(localDate: string): string {
  return `${STORAGE_PREFIX}${localDate}`;
}

export function readDismissedBannerIds(localDate: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
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

export function markBannerDismissed(localDate: string, bannerId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const existing = new Set(readDismissedBannerIds(localDate));
  existing.add(bannerId);
  try {
    window.localStorage.setItem(
      storageKey(localDate),
      JSON.stringify(Array.from(existing)),
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}
