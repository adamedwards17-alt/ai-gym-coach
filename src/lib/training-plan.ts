/**
 * Planned-versus-actual comparison, skip reasons, and proposal change shapes.
 */

import type {
  PlanEntryStatus,
  PlanTrainingTypeId,
  TrainingIntensityId,
  TrainingPlanEntryRecord,
  TrainingSessionRecord,
  TrainingTypeId,
} from "@/lib/training";

export type SkipReasonId =
  | "too_busy"
  | "low_energy"
  | "sore_recovery"
  | "away_travelling"
  | "not_motivated"
  | "other";

export const skipReasonOptions: { id: SkipReasonId; label: string }[] = [
  { id: "too_busy", label: "Too busy or no time" },
  { id: "low_energy", label: "Low energy or poor sleep" },
  { id: "sore_recovery", label: "Sore or need recovery" },
  { id: "away_travelling", label: "Away or travelling" },
  { id: "not_motivated", label: "Not feeling motivated" },
  { id: "other", label: "Other" },
];

export function isSkipReasonId(value: unknown): value is SkipReasonId {
  return skipReasonOptions.some((option) => option.id === value);
}

export function labelForSkipReason(id: SkipReasonId): string {
  return skipReasonOptions.find((option) => option.id === id)?.label ?? id;
}

export type StrengthSetDetail = {
  exercise: string;
  sets?: number | null;
  reps?: number | null;
  weightKg?: number | null;
};

export type ComparisonRow = {
  metric: string;
  planned: string;
  actual: string;
};

export type PlannedVsActual = {
  title: string;
  plannedDate: string;
  actualDate: string | null;
  rows: ComparisonRow[];
  durationDeltaMinutes: number | null;
};

export function buildPlannedVsActual(input: {
  plan: TrainingPlanEntryRecord;
  session: TrainingSessionRecord | null;
}): PlannedVsActual {
  const { plan, session } = input;
  const rows: ComparisonRow[] = [];

  if (plan.planned_duration_minutes != null && session?.duration_minutes != null) {
    rows.push({
      metric: "Duration",
      planned: `${plan.planned_duration_minutes} min`,
      actual: `${session.duration_minutes} min`,
    });
  }

  if (session?.intensity) {
    rows.push({
      metric: "Intensity",
      planned: "Not specified",
      actual: labelIntensity(session.intensity),
    });
  }

  if (plan.training_type !== "rest" && session) {
    const plannedType = plan.training_type;
    if (plannedType !== session.training_type) {
      rows.push({
        metric: "Type",
        planned: plannedType,
        actual: session.training_type,
      });
    }
  }

  const durationDeltaMinutes =
    plan.planned_duration_minutes != null && session?.duration_minutes != null
      ? session.duration_minutes - plan.planned_duration_minutes
      : null;

  return {
    title: plan.title,
    plannedDate: plan.original_plan_date ?? plan.plan_date,
    actualDate: session?.session_date ?? null,
    rows,
    durationDeltaMinutes,
  };
}

function labelIntensity(id: TrainingIntensityId): string {
  switch (id) {
    case "easy":
      return "Easy";
    case "moderate":
      return "Moderate";
    case "hard":
      return "Hard";
    case "very_hard":
      return "Very hard";
    default:
      return id;
  }
}

export function formatDurationDelta(delta: number | null): string | null {
  if (delta == null) {
    return null;
  }
  if (delta === 0) {
    return "Duration matched plan.";
  }
  const abs = Math.abs(delta);
  return delta > 0
    ? `Duration difference: +${abs} minutes.`
    : `Duration difference: −${abs} minutes.`;
}

export type PlanProposalAction =
  | "move"
  | "skip"
  | "shorten"
  | "replace"
  | "leave_skipped";

export type PlanProposalChange = {
  entryId: string;
  action: PlanProposalAction;
  toDate?: string | null;
  plannedDurationMinutes?: number | null;
  trainingType?: TrainingTypeId | PlanTrainingTypeId | null;
  title?: string | null;
  focus?: string | null;
};

export type PlanProposalStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "superseded";

export type TrainingPlanProposalRecord = {
  id: string;
  conversation_id: string | null;
  status: PlanProposalStatus;
  reason: string | null;
  changes: PlanProposalChange[];
  created_at: string;
  resolved_at: string | null;
};

export function isPlanProposalAction(
  value: unknown,
): value is PlanProposalAction {
  return (
    value === "move" ||
    value === "skip" ||
    value === "shorten" ||
    value === "replace" ||
    value === "leave_skipped"
  );
}

export function parsePlanProposalChanges(
  raw: unknown,
): PlanProposalChange[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const changes: PlanProposalChange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const entryId =
      typeof record.entry_id === "string"
        ? record.entry_id
        : typeof record.entryId === "string"
          ? record.entryId
          : null;
    if (!entryId || !isPlanProposalAction(record.action)) {
      continue;
    }
    const change: PlanProposalChange = {
      entryId,
      action: record.action,
    };
    if (typeof record.to_date === "string") {
      change.toDate = record.to_date;
    } else if (typeof record.toDate === "string") {
      change.toDate = record.toDate;
    }
    const duration =
      record.planned_duration_minutes ?? record.plannedDurationMinutes;
    if (typeof duration === "number" && Number.isFinite(duration)) {
      change.plannedDurationMinutes = Math.round(duration);
    }
    if (typeof record.training_type === "string") {
      change.trainingType = record.training_type as TrainingTypeId;
    } else if (typeof record.trainingType === "string") {
      change.trainingType = record.trainingType as TrainingTypeId;
    }
    if (typeof record.title === "string") {
      change.title = record.title;
    }
    if (typeof record.focus === "string") {
      change.focus = record.focus;
    }
    changes.push(change);
  }
  return changes.slice(0, 12);
}

export function statusLabel(status: PlanEntryStatus): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "rescheduled":
      return "Rescheduled";
    default:
      return status;
  }
}

export type AvailabilityConstraintType =
  | "unavailable"
  | "travelling"
  | "limited_time"
  | "no_gym_access"
  | "other";

export const availabilityConstraintOptions: {
  id: AvailabilityConstraintType;
  label: string;
}[] = [
  { id: "unavailable", label: "Unavailable" },
  { id: "travelling", label: "Travelling" },
  { id: "limited_time", label: "Limited time" },
  { id: "no_gym_access", label: "No gym access" },
  { id: "other", label: "Other" },
];

export function isAvailabilityConstraintType(
  value: unknown,
): value is AvailabilityConstraintType {
  return availabilityConstraintOptions.some((option) => option.id === value);
}

export type AvailabilityConstraintRecord = {
  id: string;
  start_date: string;
  end_date: string;
  constraint_type: AvailabilityConstraintType;
  notes: string | null;
  active: boolean;
  created_at: string;
};

/** Active constraints that cover `localDate` (inclusive range). */
export function activeConstraintsForDate(
  constraints: AvailabilityConstraintRecord[],
  localDate: string,
): AvailabilityConstraintRecord[] {
  return constraints.filter(
    (item) =>
      item.active &&
      item.start_date <= localDate &&
      item.end_date >= localDate,
  );
}

export function isConstraintExpired(
  constraint: AvailabilityConstraintRecord,
  localDate: string,
): boolean {
  return constraint.end_date < localDate;
}
