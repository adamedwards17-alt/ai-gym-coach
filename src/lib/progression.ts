/**
 * Deterministic double-progression recommendations.
 * Keep scripts/verify-exercise-workout-tracking.mjs in sync.
 */

export type WeightConvention =
  | "per_dumbbell"
  | "total"
  | "bodyweight"
  | "assisted";

export type CompletedSetSnapshot = {
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
  painReported: boolean;
};

export type ProgressionInput = {
  prescribedSets: number;
  repsMin: number;
  repsMax: number;
  targetRirMin: number | null;
  targetRirMax: number | null;
  weightConvention: WeightConvention;
  defaultIncrementKg: number;
  /** User-configured increment override when known. */
  configuredIncrementKg: number | null;
  lastSets: CompletedSetSnapshot[];
  painReportedThisSession: boolean;
};

export type ProgressionKind =
  | "increase_load"
  | "add_reps"
  | "keep_same"
  | "hold_for_pain"
  | "choose_starting_weight"
  | "insufficient_data";

export type ProgressionRecommendation = {
  kind: ProgressionKind;
  message: string;
  suggestedWeightKg: number | null;
  suggestedRepsTarget: number | null;
  /** Safe to present as the preferred option. */
  isPreferred: boolean;
};

function workingSets(sets: CompletedSetSnapshot[]): CompletedSetSnapshot[] {
  return sets.filter((s) => s.completed && !s.painReported);
}

function medianWeight(sets: CompletedSetSnapshot[]): number | null {
  const weights = workingSets(sets)
    .map((s) => s.weightKg)
    .filter((w): w is number => w != null && Number.isFinite(w) && w > 0)
    .sort((a, b) => a - b);
  if (weights.length === 0) {
    return null;
  }
  return weights[Math.floor(weights.length / 2)] ?? null;
}

function allSetsHitTop(input: ProgressionInput): boolean {
  const done = workingSets(input.lastSets);
  if (done.length < input.prescribedSets) {
    return false;
  }
  return done
    .slice(0, input.prescribedSets)
    .every(
      (s) =>
        s.reps != null &&
        s.reps >= input.repsMax &&
        (s.rir == null ||
          input.targetRirMax == null ||
          s.rir >= (input.targetRirMin ?? 0)),
    );
}

function anyExcessiveEffort(input: ProgressionInput): boolean {
  // Reaching top reps with RIR 0 when target is 1–2 → do not auto-increase.
  return workingSets(input.lastSets).some(
    (s) =>
      s.reps != null &&
      s.reps >= input.repsMax &&
      s.rir != null &&
      input.targetRirMin != null &&
      s.rir < input.targetRirMin,
  );
}

function nextIncrementKg(input: ProgressionInput): number {
  return input.configuredIncrementKg ?? input.defaultIncrementKg;
}

function formatWeight(
  kg: number,
  convention: WeightConvention,
): string {
  if (convention === "per_dumbbell") {
    return `${kg}kg dumbbells (each)`;
  }
  if (convention === "bodyweight") {
    return kg > 0 ? `bodyweight + ${kg}kg` : "bodyweight";
  }
  if (convention === "assisted") {
    return `${kg}kg assisted`;
  }
  return `${kg}kg`;
}

export function buildProgressionRecommendation(
  input: ProgressionInput,
): ProgressionRecommendation {
  if (input.painReportedThisSession) {
    return {
      kind: "hold_for_pain",
      message:
        "Pain was reported on this movement. Do not increase the load. Stop or modify if discomfort continues, and seek assessment from a qualified healthcare professional if symptoms persist or worsen.",
      suggestedWeightKg: medianWeight(input.lastSets),
      suggestedRepsTarget: input.repsMin,
      isPreferred: true,
    };
  }

  const lastWorking = workingSets(input.lastSets);
  if (lastWorking.length === 0) {
    return {
      kind: "choose_starting_weight",
      message:
        "No previous sets on file for this exercise. Choose a manageable starting weight within the prescribed rep range and leave about 1–2 reps in reserve.",
      suggestedWeightKg: null,
      suggestedRepsTarget: input.repsMin,
      isPreferred: true,
    };
  }

  if (lastWorking.some((s) => s.painReported)) {
    return {
      kind: "hold_for_pain",
      message:
        "Your last logged sets for this exercise included pain notes. Keep the load the same or reduce it — do not progress until the movement feels comfortable again.",
      suggestedWeightKg: medianWeight(input.lastSets),
      suggestedRepsTarget: input.repsMin,
      isPreferred: true,
    };
  }

  const lastWeight = medianWeight(input.lastSets);
  if (lastWeight == null) {
    return {
      kind: "insufficient_data",
      message:
        "Previous sets are missing weight data, so there’s no reliable load recommendation yet. Log weights today to unlock progression guidance.",
      suggestedWeightKg: null,
      suggestedRepsTarget: input.repsMin,
      isPreferred: true,
    };
  }

  if (allSetsHitTop(input) && !anyExcessiveEffort(input)) {
    const increment = nextIncrementKg(input);
    // Unusually large jump relative to load → prefer reps over load.
    if (lastWeight > 0 && increment / lastWeight > 0.15) {
      return {
        kind: "add_reps",
        message: `You hit the top of the rep range, but the next available jump (${increment}kg) is large relative to ${formatWeight(
          lastWeight,
          input.weightConvention,
        )}. Keep the same load and solidify form and reps before increasing.`,
        suggestedWeightKg: lastWeight,
        suggestedRepsTarget: input.repsMax,
        isPreferred: true,
      };
    }
    const next = Math.round((lastWeight + increment) * 10) / 10;
    return {
      kind: "increase_load",
      message: `Last time you completed all ${input.prescribedSets} sets for ${input.repsMax} reps with good form. Try ${formatWeight(
        next,
        input.weightConvention,
      )} this session and aim for the lower end of the ${input.repsMin}–${input.repsMax} range.`,
      suggestedWeightKg: next,
      suggestedRepsTarget: input.repsMin,
      isPreferred: true,
    };
  }

  if (anyExcessiveEffort(input)) {
    return {
      kind: "keep_same",
      message: `You reached high reps but with little reserve left. Keep ${formatWeight(
        lastWeight,
        input.weightConvention,
      )} and aim for cleaner reps with about 1–2 left in reserve before adding load.`,
      suggestedWeightKg: lastWeight,
      suggestedRepsTarget: input.repsMax,
      isPreferred: true,
    };
  }

  const bestReps = Math.max(
    ...lastWorking.map((s) => s.reps ?? 0),
  );
  if (bestReps < input.repsMax) {
    return {
      kind: "add_reps",
      message: `Keep ${formatWeight(
        lastWeight,
        input.weightConvention,
      )} and aim for one or two additional reps across your sets while maintaining good form (${input.repsMin}–${input.repsMax}).`,
      suggestedWeightKg: lastWeight,
      suggestedRepsTarget: Math.min(bestReps + 1, input.repsMax),
      isPreferred: true,
    };
  }

  return {
    kind: "keep_same",
    message: `Stay at ${formatWeight(
      lastWeight,
      input.weightConvention,
    )} within ${input.repsMin}–${input.repsMax} reps. Increase load only once all working sets hit the top of the range with solid form.`,
    suggestedWeightKg: lastWeight,
    suggestedRepsTarget: input.repsMax,
    isPreferred: true,
  };
}

export function formatLastPerformance(
  sets: CompletedSetSnapshot[],
  convention: WeightConvention,
  sessionDate: string | null,
): string | null {
  const done = workingSets(sets).sort((a, b) => a.setNumber - b.setNumber);
  if (done.length === 0) {
    return null;
  }
  const weight = medianWeight(done);
  const reps = done.map((s) => s.reps ?? "—").join(", ");
  const weightLabel =
    weight != null ? formatWeight(weight, convention) : "weight not logged";
  const dateBit = sessionDate ? ` (${sessionDate})` : "";
  return `Last time${dateBit}: ${weightLabel}, ${reps} reps.`;
}
