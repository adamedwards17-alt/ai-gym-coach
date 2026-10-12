/**
 * Deadline-aware programme phase scheduling helpers.
 * Dates are local YYYY-MM-DD strings (no timezone shift via Date.UTC day math).
 */

export type PhaseScheduleInput = {
  id?: string | null;
  slug?: string | null;
  name: string;
  kind: string;
  status: "active" | "upcoming" | "completed";
  durationWeeks: number;
  sortOrder: number;
};

export type PhaseScheduleResult = PhaseScheduleInput & {
  startDate: string | null;
  endDate: string | null;
};

export function daysBetweenInclusive(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.floor((to - from) / 86_400_000);
}

export function weeksRemainingUntil(
  fromIso: string,
  targetIso: string,
): number {
  const days = daysBetweenInclusive(fromIso, targetIso);
  if (days < 0) {
    return 0;
  }
  return Math.floor(days / 7);
}

export function addDaysIso(iso: string, deltaDays: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function totalPhaseWeeks(phases: Array<{ durationWeeks: number }>): number {
  return phases.reduce((sum, phase) => sum + Math.max(0, phase.durationWeeks), 0);
}

export type ProgrammeFitResult =
  | { status: "fits"; weeksAvailable: number; weeksRequired: number }
  | {
      status: "overflow";
      weeksAvailable: number;
      weeksRequired: number;
      shortfallWeeks: number;
    }
  | { status: "no_deadline"; weeksRequired: number };

/**
 * Check whether a proposed phase stack fits between today and the target date.
 * Uses whole weeks remaining (floor), matching coaching language.
 */
export function checkProgrammeFitsDeadline(input: {
  todayIso: string;
  targetDateIso: string | null;
  phases: Array<{ durationWeeks: number; status?: string }>;
}): ProgrammeFitResult {
  const relevant = input.phases.filter(
    (phase) => phase.status !== "completed",
  );
  const weeksRequired = totalPhaseWeeks(relevant);

  if (!input.targetDateIso) {
    return { status: "no_deadline", weeksRequired };
  }

  const weeksAvailable = weeksRemainingUntil(
    input.todayIso,
    input.targetDateIso,
  );

  if (weeksRequired <= weeksAvailable) {
    return { status: "fits", weeksAvailable, weeksRequired };
  }

  return {
    status: "overflow",
    weeksAvailable,
    weeksRequired,
    shortfallWeeks: weeksRequired - weeksAvailable,
  };
}

/**
 * Lay out active + upcoming phases sequentially from an anchor start date.
 * Completed phases keep null dates (historical) unless already dated.
 */
export function scheduleProgrammePhases(input: {
  anchorStartIso: string;
  phases: PhaseScheduleInput[];
}): PhaseScheduleResult[] {
  const sorted = [...input.phases].sort((a, b) => a.sortOrder - b.sortOrder);
  let cursor = input.anchorStartIso;
  const results: PhaseScheduleResult[] = [];

  for (const phase of sorted) {
    if (phase.status === "completed") {
      results.push({
        ...phase,
        startDate: null,
        endDate: null,
      });
      continue;
    }

    const weeks = Math.max(1, Math.round(phase.durationWeeks));
    const startDate = cursor;
    const endDate = addDaysIso(startDate, weeks * 7 - 1);
    results.push({
      ...phase,
      durationWeeks: weeks,
      startDate,
      endDate,
    });
    cursor = addDaysIso(endDate, 1);
  }

  return results;
}

/**
 * Suggest a shortened phase stack that fits the deadline while preserving order.
 * Prefer shortening the first (active) phase, then upcoming ones.
 */
export function suggestPhasesForDeadline(input: {
  todayIso: string;
  targetDateIso: string;
  phases: PhaseScheduleInput[];
  minWeeksPerPhase?: number;
}): PhaseScheduleInput[] | null {
  const minWeeks = input.minWeeksPerPhase ?? 2;
  const weeksAvailable = weeksRemainingUntil(
    input.todayIso,
    input.targetDateIso,
  );
  if (weeksAvailable < minWeeks) {
    return null;
  }

  const editable = input.phases
    .filter((p) => p.status !== "completed")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (editable.length === 0) {
    return [];
  }

  let remaining = weeksAvailable;
  const adjusted: PhaseScheduleInput[] = [];

  for (let i = 0; i < editable.length; i += 1) {
    const phase = editable[i];
    const phasesLeft = editable.length - i;
    const minForRest = (phasesLeft - 1) * minWeeks;
    const maxForThis = Math.max(minWeeks, remaining - minForRest);
    const desired = Math.min(phase.durationWeeks, maxForThis);
    const weeks = Math.max(minWeeks, Math.min(desired, remaining));
    adjusted.push({
      ...phase,
      durationWeeks: weeks,
      name: phase.name.replace(/\d+\s*weeks?/i, `${weeks} weeks`),
    });
    remaining -= weeks;
  }

  if (totalPhaseWeeks(adjusted) > weeksAvailable) {
    return null;
  }

  return [
    ...input.phases.filter((p) => p.status === "completed"),
    ...adjusted,
  ];
}
