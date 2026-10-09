/**
 * Canonical body-weight history helpers.
 * Keep scripts/verify-profile-goals-progress.mjs in sync.
 */

export type WeightMeasurementSource =
  | "onboarding"
  | "profile"
  | "progress"
  | "weekly_checkin"
  | "manual"
  | "import";

export type WeightMeasurementRecord = {
  id: string;
  measured_on: string;
  weight_kg: number;
  source: WeightMeasurementSource;
  notes: string | null;
  created_at: string;
};

export function isValidWeightKg(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 500;
}

export function latestWeightKg(
  measurements: WeightMeasurementRecord[],
): number | null {
  if (measurements.length === 0) {
    return null;
  }
  const sorted = [...measurements].sort((a, b) => {
    if (a.measured_on !== b.measured_on) {
      return b.measured_on.localeCompare(a.measured_on);
    }
    return b.created_at.localeCompare(a.created_at);
  });
  return sorted[0]?.weight_kg ?? null;
}

/** Simple weekly trend: latest vs ~7 days earlier (or oldest in window). */
export function weightTrendKg(
  measurements: WeightMeasurementRecord[],
  asOfDate: string,
): number | null {
  if (measurements.length < 2) {
    return null;
  }
  const sorted = [...measurements].sort((a, b) =>
    a.measured_on.localeCompare(b.measured_on),
  );
  const latest = [...sorted].reverse().find((m) => m.measured_on <= asOfDate);
  if (!latest) {
    return null;
  }
  const [y, m, d] = asOfDate.split("-").map(Number);
  const weekAgoDate = new Date(y, m - 1, d - 7);
  const weekAgo = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(weekAgoDate);

  const earlier =
    [...sorted]
      .reverse()
      .find((entry) => entry.measured_on <= weekAgo) ?? sorted[0];

  if (!earlier || earlier.id === latest.id) {
    return null;
  }
  return Math.round((latest.weight_kg - earlier.weight_kg) * 10) / 10;
}

export function formatWeightTrend(deltaKg: number | null): string | null {
  if (deltaKg == null) {
    return null;
  }
  if (Math.abs(deltaKg) < 0.05) {
    return "Stable over the past week";
  }
  const abs = Math.abs(deltaKg).toFixed(1);
  return deltaKg < 0
    ? `Down about ${abs} kg over the past week`
    : `Up about ${abs} kg over the past week`;
}
