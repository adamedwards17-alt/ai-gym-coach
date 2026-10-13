/**
 * Typed coach change proposals (nutrition, programme, activity, goal, weekly schedule).
 * Suggestions stay pending until explicitly accepted.
 */

import {
  describeWeeklySchedule,
  parseWeeklySchedulePayload,
  reviewWeeklySchedule,
} from "@/lib/weekly-schedule";

export type CoachChangeKind =
  | "nutrition_targets"
  | "programme_phases"
  | "activity_pattern"
  | "goal"
  | "weekly_schedule";

export type CoachChangeProposalStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "superseded";

export type NutritionTargetsProposalPayload = {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Coach-agreed targets are stored as manual so auto recalc won't overwrite. */
  setManual: boolean;
};

export type ProgrammePhaseProposalItem = {
  phaseId?: string | null;
  slug?: string | null;
  name?: string | null;
  kind?: "muscle_building" | "fat_loss" | "other" | null;
  status?: "active" | "upcoming" | "completed" | null;
  durationWeeks: number;
  sortOrder?: number | null;
};

export type ProgrammePhasesProposalPayload = {
  phases: ProgrammePhaseProposalItem[];
  /** Anchor for rescheduling active/upcoming phases (YYYY-MM-DD). */
  anchorDate?: string | null;
  programmeName?: string | null;
};

export type ActivityPatternProposalPayload = {
  activityLevel?: string | null;
  commuteSituation?: string | null;
  commutePattern?: Array<{
    method: string;
    daysPerWeek: number;
    minutesOneWay?: number | null;
  }> | null;
  /** @deprecated Prefer commutePattern. */
  cycleCommuteDaysPerWeek?: number | null;
  /** @deprecated Prefer commutePattern. */
  cycleCommuteMinutes?: number | null;
  activityPatternNotes?: string | null;
};

export type GoalProposalPayload = {
  primaryGoal?: string | null;
  targetDate?: string | null;
  /** If set and targetDate omitted, target date is derived on accept from today + weeks. */
  durationWeeks?: number | null;
  targetWeightKg?: number | null;
  goalInOwnWords?: string | null;
};

export type WeeklyScheduleProposalPayload = {
  slots: Array<{
    dayOfWeek: number;
    slotType: string;
    title: string;
    templateCode?: string | null;
    plannedDurationMinutes?: number | null;
  }>;
  weeksToReseed?: number;
};

export type CoachChangePayload =
  | NutritionTargetsProposalPayload
  | ProgrammePhasesProposalPayload
  | ActivityPatternProposalPayload
  | GoalProposalPayload
  | WeeklyScheduleProposalPayload;

export type CoachChangeProposalRecord = {
  id: string;
  conversation_id: string | null;
  kind: CoachChangeKind;
  status: CoachChangeProposalStatus;
  reason: string | null;
  payload: CoachChangePayload;
  created_at: string;
  resolved_at: string | null;
};

export type ParsedNutritionProposal = {
  reason: string | null;
  payload: NutritionTargetsProposalPayload;
};

export type ParsedProgrammeProposal = {
  reason: string | null;
  payload: ProgrammePhasesProposalPayload;
};

export type ParsedActivityProposal = {
  reason: string | null;
  payload: ActivityPatternProposalPayload;
};

export type ParsedGoalProposal = {
  reason: string | null;
  payload: GoalProposalPayload;
};

const KINDS: readonly CoachChangeKind[] = [
  "nutrition_targets",
  "programme_phases",
  "activity_pattern",
  "goal",
  "weekly_schedule",
] as const;

export function isCoachChangeKind(value: unknown): value is CoachChangeKind {
  return (
    typeof value === "string" &&
    (KINDS as readonly string[]).includes(value)
  );
}

function asPositiveInt(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    return null;
  }
  return rounded;
}

function asOptionalString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLen);
}

export function parseNutritionProposalPayload(
  raw: unknown,
): NutritionTargetsProposalPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const dailyCalories = asPositiveInt(
    record.dailyCalories ?? record.daily_calories,
    1200,
    5000,
  );
  const proteinG = asPositiveInt(
    record.proteinG ?? record.protein_g,
    40,
    300,
  );
  const carbsG = asPositiveInt(record.carbsG ?? record.carbs_g, 0, 700);
  const fatG = asPositiveInt(record.fatG ?? record.fat_g, 20, 200);
  if (
    dailyCalories == null ||
    proteinG == null ||
    carbsG == null ||
    fatG == null
  ) {
    return null;
  }
  const setManual =
    record.setManual === false || record.set_manual === false ? false : true;
  return { dailyCalories, proteinG, carbsG, fatG, setManual };
}

export function parseProgrammeProposalPayload(
  raw: unknown,
): ProgrammePhasesProposalPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const phasesRaw = Array.isArray(record.phases) ? record.phases : [];
  const phases: ProgrammePhaseProposalItem[] = [];
  for (const item of phasesRaw.slice(0, 6)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const phase = item as Record<string, unknown>;
    const durationWeeks = asPositiveInt(
      phase.durationWeeks ?? phase.duration_weeks,
      1,
      52,
    );
    if (durationWeeks == null) {
      continue;
    }
    const kindRaw = phase.kind;
    const kind =
      kindRaw === "muscle_building" ||
      kindRaw === "fat_loss" ||
      kindRaw === "other"
        ? kindRaw
        : null;
    const statusRaw = phase.status;
    const status =
      statusRaw === "active" ||
      statusRaw === "upcoming" ||
      statusRaw === "completed"
        ? statusRaw
        : null;
    phases.push({
      phaseId:
        typeof phase.phaseId === "string"
          ? phase.phaseId
          : typeof phase.phase_id === "string"
            ? phase.phase_id
            : typeof phase.id === "string"
              ? phase.id
              : null,
      slug: asOptionalString(phase.slug, 80),
      name: asOptionalString(phase.name, 120),
      kind,
      status,
      durationWeeks,
      sortOrder: asPositiveInt(phase.sortOrder ?? phase.sort_order, 0, 20),
    });
  }
  if (phases.length === 0) {
    return null;
  }
  const anchor =
    typeof record.anchorDate === "string"
      ? record.anchorDate
      : typeof record.anchor_date === "string"
        ? record.anchor_date
        : null;
  return {
    phases,
    anchorDate: anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : null,
    programmeName: asOptionalString(
      record.programmeName ?? record.programme_name,
      120,
    ),
  };
}

export function parseActivityProposalPayload(
  raw: unknown,
): ActivityPatternProposalPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const activityLevel = asOptionalString(
    record.activityLevel ?? record.activity_level,
    40,
  );
  const commuteSituation = asOptionalString(
    record.commuteSituation ?? record.commute_situation,
    40,
  );
  const commutePatternRaw =
    record.commutePattern ?? record.commute_pattern;
  let commutePattern: ActivityPatternProposalPayload["commutePattern"] = null;
  if (Array.isArray(commutePatternRaw)) {
    const entries: NonNullable<
      ActivityPatternProposalPayload["commutePattern"]
    > = [];
    for (const item of commutePatternRaw.slice(0, 8)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const entry = item as Record<string, unknown>;
      const method = asOptionalString(entry.method, 40);
      const daysPerWeek = asPositiveInt(
        entry.daysPerWeek ?? entry.days_per_week,
        1,
        7,
      );
      if (!method || daysPerWeek == null) {
        continue;
      }
      entries.push({
        method,
        daysPerWeek,
        minutesOneWay: asPositiveInt(
          entry.minutesOneWay ?? entry.minutes_one_way,
          1,
          180,
        ),
      });
    }
    commutePattern = entries;
  }
  const cycleCommuteDaysPerWeek = asPositiveInt(
    record.cycleCommuteDaysPerWeek ?? record.cycle_commute_days_per_week,
    0,
    7,
  );
  const cycleCommuteMinutes = asPositiveInt(
    record.cycleCommuteMinutes ?? record.cycle_commute_minutes,
    1,
    180,
  );
  const activityPatternNotes = asOptionalString(
    record.activityPatternNotes ?? record.activity_pattern_notes,
    400,
  );
  if (
    activityLevel == null &&
    commuteSituation == null &&
    (commutePattern == null || commutePattern.length === 0) &&
    cycleCommuteDaysPerWeek == null &&
    cycleCommuteMinutes == null &&
    activityPatternNotes == null
  ) {
    return null;
  }
  return {
    activityLevel,
    commuteSituation,
    commutePattern,
    cycleCommuteDaysPerWeek,
    cycleCommuteMinutes,
    activityPatternNotes,
  };
}

export function parseGoalProposalPayload(
  raw: unknown,
): GoalProposalPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const primaryGoal = asOptionalString(
    record.primaryGoal ?? record.primary_goal,
    40,
  );
  const targetDateRaw =
    typeof record.targetDate === "string"
      ? record.targetDate
      : typeof record.target_date === "string"
        ? record.target_date
        : null;
  const targetDate =
    targetDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(targetDateRaw)
      ? targetDateRaw
      : null;
  const targetWeightKg =
    typeof (record.targetWeightKg ?? record.target_weight_kg) === "number"
      ? Number(record.targetWeightKg ?? record.target_weight_kg)
      : null;
  const durationWeeks = asPositiveInt(
    record.durationWeeks ?? record.duration_weeks,
    1,
    52,
  );
  const goalInOwnWords = asOptionalString(
    record.goalInOwnWords ?? record.goal_in_own_words,
    400,
  );
  if (
    primaryGoal == null &&
    targetDate == null &&
    durationWeeks == null &&
    targetWeightKg == null &&
    goalInOwnWords == null
  ) {
    return null;
  }
  return {
    primaryGoal,
    targetDate,
    durationWeeks,
    targetWeightKg:
      targetWeightKg != null &&
      Number.isFinite(targetWeightKg) &&
      targetWeightKg >= 35 &&
      targetWeightKg <= 250
        ? Math.round(targetWeightKg * 10) / 10
        : null,
    goalInOwnWords,
  };
}

export function parseWeeklyScheduleProposalPayload(
  raw: unknown,
): WeeklyScheduleProposalPayload | null {
  const parsed = parseWeeklySchedulePayload(raw);
  if (!parsed) {
    return null;
  }
  return {
    slots: parsed.slots.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      slotType: slot.slotType,
      title: slot.title,
      templateCode: slot.templateCode ?? null,
      plannedDurationMinutes: slot.plannedDurationMinutes ?? null,
    })),
    weeksToReseed: parsed.weeksToReseed,
  };
}

export function toCoachChangeProposalRecord(
  row: Record<string, unknown>,
): CoachChangeProposalRecord | null {
  if (typeof row.id !== "string" || !isCoachChangeKind(row.kind)) {
    return null;
  }
  if (
    typeof row.status !== "string" ||
    !["pending", "accepted", "rejected", "superseded"].includes(row.status)
  ) {
    return null;
  }
  if (typeof row.created_at !== "string") {
    return null;
  }

  let payload: CoachChangePayload | null = null;
  if (row.kind === "nutrition_targets") {
    payload = parseNutritionProposalPayload(row.payload);
  } else if (row.kind === "programme_phases") {
    payload = parseProgrammeProposalPayload(row.payload);
  } else if (row.kind === "activity_pattern") {
    payload = parseActivityProposalPayload(row.payload);
  } else if (row.kind === "goal") {
    payload = parseGoalProposalPayload(row.payload);
  } else if (row.kind === "weekly_schedule") {
    payload = parseWeeklyScheduleProposalPayload(row.payload);
  }
  if (!payload) {
    return null;
  }

  return {
    id: row.id,
    conversation_id:
      typeof row.conversation_id === "string" ? row.conversation_id : null,
    kind: row.kind,
    status: row.status as CoachChangeProposalStatus,
    reason:
      typeof row.reason === "string" && row.reason.trim()
        ? row.reason.trim()
        : null,
    payload,
    created_at: row.created_at,
    resolved_at:
      typeof row.resolved_at === "string" ? row.resolved_at : null,
  };
}

export function describeCoachChangeProposal(
  proposal: CoachChangeProposalRecord,
): string[] {
  if (proposal.kind === "nutrition_targets") {
    const p = proposal.payload as NutritionTargetsProposalPayload;
    return [
      `Calories → ${p.dailyCalories} kcal`,
      `Protein → ${p.proteinG} g`,
      `Carbs → ${p.carbsG} g`,
      `Fat → ${p.fatG} g`,
      p.setManual
        ? "Saved as a confirmed (manual) target"
        : "Kept as automatic target",
    ];
  }
  if (proposal.kind === "programme_phases") {
    const p = proposal.payload as ProgrammePhasesProposalPayload;
    return p.phases.map((phase) => {
      const label = phase.name ?? phase.slug ?? "Phase";
      return `${label}: ${phase.durationWeeks} week${
        phase.durationWeeks === 1 ? "" : "s"
      }`;
    });
  }
  if (proposal.kind === "activity_pattern") {
    const p = proposal.payload as ActivityPatternProposalPayload;
    const lines: string[] = [];
    if (p.activityLevel) {
      lines.push(`Daily movement → ${p.activityLevel}`);
    }
    if (p.commuteSituation) {
      lines.push(`Commute situation → ${p.commuteSituation}`);
    }
    if (p.commutePattern && p.commutePattern.length > 0) {
      for (const entry of p.commutePattern) {
        lines.push(
          `${entry.method}: ${entry.daysPerWeek} day${
            entry.daysPerWeek === 1 ? "" : "s"
          }/week` +
            (entry.minutesOneWay != null
              ? ` (~${entry.minutesOneWay} min)`
              : ""),
        );
      }
    } else if (p.cycleCommuteDaysPerWeek != null) {
      lines.push(
        `Cycle commute → ${p.cycleCommuteDaysPerWeek} day${
          p.cycleCommuteDaysPerWeek === 1 ? "" : "s"
        }/week`,
      );
      if (p.cycleCommuteMinutes != null) {
        lines.push(`Typical ride → ~${p.cycleCommuteMinutes} min`);
      }
    }
    if (p.activityPatternNotes) {
      lines.push(p.activityPatternNotes);
    }
    return lines;
  }
  if (proposal.kind === "weekly_schedule") {
    const p = proposal.payload as WeeklyScheduleProposalPayload;
    const review = reviewWeeklySchedule(
      p.slots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        slotType:
          slot.slotType === "strength" ||
          slot.slotType === "hiit" ||
          slot.slotType === "rest" ||
          slot.slotType === "other"
            ? slot.slotType
            : "other",
        title: slot.title,
        templateCode: slot.templateCode ?? null,
        plannedDurationMinutes: slot.plannedDurationMinutes ?? null,
      })),
    );
    const lines = describeWeeklySchedule(
      p.slots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        slotType:
          slot.slotType === "strength" ||
          slot.slotType === "hiit" ||
          slot.slotType === "rest" ||
          slot.slotType === "other"
            ? slot.slotType
            : "other",
        title: slot.title,
        templateCode: slot.templateCode ?? null,
        plannedDurationMinutes: slot.plannedDurationMinutes ?? null,
      })),
    );
    if (review.recoveryNote) {
      lines.push(review.recoveryNote);
    }
    return lines;
  }
  const p = proposal.payload as GoalProposalPayload;
  const lines: string[] = [];
  if (p.primaryGoal) {
    lines.push(`Goal → ${p.primaryGoal}`);
  }
  if (p.targetDate) {
    lines.push(`Target date → ${p.targetDate}`);
  } else if (p.durationWeeks != null) {
    lines.push(`Duration → ${p.durationWeeks} weeks`);
  }
  if (p.targetWeightKg != null) {
    lines.push(`Target weight → ${p.targetWeightKg} kg`);
  }
  if (p.goalInOwnWords) {
    lines.push(p.goalInOwnWords);
  }
  return lines;
}
