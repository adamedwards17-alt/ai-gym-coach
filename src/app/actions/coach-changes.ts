"use server";

import { getCurrentUser } from "@/lib/auth/session";
import {
  type ActivityPatternProposalPayload,
  type CoachChangeKind,
  type CoachChangeProposalRecord,
  type GoalProposalPayload,
  type NutritionTargetsProposalPayload,
  type ProgrammePhasesProposalPayload,
  describeCoachChangeProposal,
  isCoachChangeKind,
  parseActivityProposalPayload,
  parseGoalProposalPayload,
  parseNutritionProposalPayload,
  parseProgrammeProposalPayload,
  parseWeeklyScheduleProposalPayload,
  toCoachChangeProposalRecord,
  type WeeklyScheduleProposalPayload,
} from "@/lib/coach-change-proposals";
import {
  completeWeeklySchedule,
  type WeeklyScheduleSlot,
} from "@/lib/weekly-schedule";
import { addDays, startOfWeekMonday } from "@/lib/training-week";
import { applyNutritionTargetsForUser } from "@/lib/nutrition-day";
import {
  scheduleProgrammePhases,
  type PhaseScheduleInput,
} from "@/lib/programme-deadline";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getLocalLoggedDate } from "@/lib/nutrition";

const PROPOSAL_SELECT =
  "id, conversation_id, kind, status, reason, payload, created_at, resolved_at, idempotency_key";

export type ListCoachChangesResult =
  | { status: "ok"; proposals: CoachChangeProposalRecord[] }
  | { status: "error"; message: string };

export type CreateCoachChangeResult =
  | { status: "ok"; proposal: CoachChangeProposalRecord }
  | { status: "error"; message: string };

export type ResolveCoachChangeResult =
  | { status: "accepted"; proposal: CoachChangeProposalRecord }
  | { status: "rejected"; proposal: CoachChangeProposalRecord }
  | { status: "error"; message: string };

export async function listPendingCoachChangeProposals(input?: {
  conversationId?: string | null;
}): Promise<ListCoachChangesResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  try {
    const supabase = await createClient();
    let query = supabase
      .from("coach_change_proposals")
      .select(PROPOSAL_SELECT)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(8);
    if (input?.conversationId) {
      query = query.eq("conversation_id", input.conversationId);
    }
    const { data, error } = await query;
    if (error) {
      return { status: "error", message: "Proposals couldn’t be loaded." };
    }
    const proposals = (data ?? [])
      .map((row) =>
        toCoachChangeProposalRecord(row as Record<string, unknown>),
      )
      .filter((row): row is CoachChangeProposalRecord => row !== null);
    return { status: "ok", proposals };
  } catch {
    return { status: "error", message: "Proposals couldn’t be loaded." };
  }
}

export async function createCoachChangeProposal(input: {
  conversationId?: string | null;
  kind: CoachChangeKind;
  reason?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
}): Promise<CreateCoachChangeResult> {
  if (!isCoachChangeKind(input.kind)) {
    return { status: "error", message: "Unknown proposal type." };
  }

  let normalized: Record<string, unknown> | null = null;
  if (input.kind === "nutrition_targets") {
    const parsed = parseNutritionProposalPayload(input.payload);
    if (!parsed) {
      return { status: "error", message: "Nutrition proposal isn’t valid." };
    }
    normalized = parsed as unknown as Record<string, unknown>;
  } else if (input.kind === "programme_phases") {
    const parsed = parseProgrammeProposalPayload(input.payload);
    if (!parsed) {
      return { status: "error", message: "Programme proposal isn’t valid." };
    }
    normalized = parsed as unknown as Record<string, unknown>;
  } else if (input.kind === "activity_pattern") {
    const parsed = parseActivityProposalPayload(input.payload);
    if (!parsed) {
      return { status: "error", message: "Activity proposal isn’t valid." };
    }
    normalized = parsed as unknown as Record<string, unknown>;
  } else if (input.kind === "weekly_schedule") {
    const parsed = parseWeeklyScheduleProposalPayload(input.payload);
    if (!parsed) {
      return {
        status: "error",
        message: "Weekly schedule proposal isn’t valid.",
      };
    }
    normalized = parsed as unknown as Record<string, unknown>;
  } else {
    const parsed = parseGoalProposalPayload(input.payload);
    if (!parsed) {
      return { status: "error", message: "Goal proposal isn’t valid." };
    }
    normalized = parsed as unknown as Record<string, unknown>;
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const idempotencyKey =
    typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()
      ? input.idempotencyKey.trim().slice(0, 120)
      : null;

  try {
    const supabase = await createClient();

    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("coach_change_proposals")
        .select(PROPOSAL_SELECT)
        .eq("user_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        const proposal = toCoachChangeProposalRecord(
          existing as Record<string, unknown>,
        );
        if (proposal) {
          return { status: "ok", proposal };
        }
      }
    }

    if (input.conversationId) {
      await supabase
        .from("coach_change_proposals")
        .update({
          status: "superseded",
          resolved_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("conversation_id", input.conversationId)
        .eq("kind", input.kind)
        .eq("status", "pending");
    }

    const { data, error } = await supabase
      .from("coach_change_proposals")
      .insert({
        user_id: user.id,
        conversation_id: input.conversationId ?? null,
        kind: input.kind,
        status: "pending",
        reason:
          typeof input.reason === "string" && input.reason.trim()
            ? input.reason.trim().slice(0, 400)
            : null,
        payload: normalized,
        idempotency_key: idempotencyKey,
      })
      .select(PROPOSAL_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[coach-changes] Create failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "That proposal couldn’t be saved. Try again.",
      };
    }

    const proposal = toCoachChangeProposalRecord(
      data as Record<string, unknown>,
    );
    if (!proposal) {
      return {
        status: "error",
        message: "That proposal couldn’t be saved. Try again.",
      };
    }
    return { status: "ok", proposal };
  } catch (error) {
    console.error("[coach-changes] Create failed:", error);
    return {
      status: "error",
      message: "That proposal couldn’t be saved. Try again.",
    };
  }
}

async function applyNutritionProposal(
  userId: string,
  payload: NutritionTargetsProposalPayload,
): Promise<string | null> {
  const supabase = await createClient();
  const result = await applyNutritionTargetsForUser(supabase, {
    userId,
    dailyCalories: payload.dailyCalories,
    proteinG: payload.proteinG,
    carbsG: payload.carbsG,
    fatG: payload.fatG,
    isManual: payload.setManual,
    source: "coach_proposal",
    reason: "Confirmed with coach",
  });
  return result.status === "ok" ? null : result.message;
}

async function applyProgrammeProposal(
  userId: string,
  payload: ProgrammePhasesProposalPayload,
): Promise<string | null> {
  const supabase = await createClient();
  const { data: programme } = await supabase
    .from("training_programmes")
    .select("id, name")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!programme) {
    return "No active programme to update.";
  }

  const { data: phaseRows, error } = await supabase
    .from("training_phases")
    .select(
      "id, slug, name, kind, status, start_date, end_date, duration_weeks, sort_order",
    )
    .eq("programme_id", programme.id)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error || !phaseRows?.length) {
    return "Programme phases couldn’t be loaded.";
  }

  const existing = phaseRows as Array<{
    id: string;
    slug: string;
    name: string;
    kind: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    duration_weeks: number | null;
    sort_order: number;
  }>;

  const scheduleInputs: PhaseScheduleInput[] = existing.map((phase) => {
    const match =
      payload.phases.find(
        (item) =>
          (item.phaseId && item.phaseId === phase.id) ||
          (item.slug && item.slug === phase.slug),
      ) ??
      payload.phases.find(
        (item) =>
          item.status &&
          item.status === phase.status &&
          !payload.phases.some(
            (other) =>
              (other.phaseId && other.phaseId === phase.id) ||
              (other.slug && other.slug === phase.slug),
          ),
      );

    const durationWeeks =
      match?.durationWeeks ??
      phase.duration_weeks ??
      4;
    const status =
      (match?.status as PhaseScheduleInput["status"] | null) ??
      (phase.status as PhaseScheduleInput["status"]);

    return {
      id: phase.id,
      slug: phase.slug,
      name: match?.name ?? phase.name,
      kind: match?.kind ?? phase.kind,
      status,
      durationWeeks,
      sortOrder: match?.sortOrder ?? phase.sort_order,
    };
  });

  // Also allow proposing brand-new upcoming phase durations by sort order index.
  for (const proposed of payload.phases) {
    if (proposed.phaseId || proposed.slug) {
      continue;
    }
    const byOrder = scheduleInputs.find(
      (phase) =>
        proposed.sortOrder != null &&
        phase.sortOrder === proposed.sortOrder,
    );
    if (byOrder) {
      byOrder.durationWeeks = proposed.durationWeeks;
      if (proposed.name) {
        byOrder.name = proposed.name;
      }
      if (proposed.kind) {
        byOrder.kind = proposed.kind;
      }
      if (proposed.status) {
        byOrder.status = proposed.status;
      }
    }
  }

  const anchor =
    payload.anchorDate ??
    existing.find((p) => p.status === "active")?.start_date ??
    getLocalLoggedDate();

  const scheduled = scheduleProgrammePhases({
    anchorStartIso: anchor,
    phases: scheduleInputs,
  });

  for (const phase of scheduled) {
    if (!phase.id) {
      continue;
    }
    const { error: updateError } = await supabase
      .from("training_phases")
      .update({
        name: phase.name,
        kind: phase.kind,
        status: phase.status,
        duration_weeks: phase.durationWeeks,
        start_date: phase.startDate,
        end_date: phase.endDate,
        sort_order: phase.sortOrder,
      })
      .eq("id", phase.id)
      .eq("user_id", userId);

    if (updateError) {
      console.error(
        "[coach-changes] Phase update failed:",
        updateError.message,
      );
      return "Programme phases couldn’t be updated.";
    }
  }

  if (payload.programmeName) {
    await supabase
      .from("training_programmes")
      .update({ name: payload.programmeName })
      .eq("id", programme.id)
      .eq("user_id", userId);
  } else {
    const totalWeeks = scheduled
      .filter((p) => p.status !== "completed")
      .reduce((sum, p) => sum + p.durationWeeks, 0);
    const active = scheduled.find((p) => p.status === "active");
    if (active) {
      await supabase
        .from("training_programmes")
        .update({
          name: `${active.durationWeeks}-week ${
            active.kind === "fat_loss"
              ? "fat loss"
              : active.kind === "muscle_building"
                ? "muscle building"
                : "training"
          }${totalWeeks !== active.durationWeeks ? ` (+ follow-on)` : ""}`,
        })
        .eq("id", programme.id)
        .eq("user_id", userId);
    }
  }

  return null;
}

async function applyActivityProposal(
  userId: string,
  payload: ActivityPatternProposalPayload,
): Promise<string | null> {
  const supabase = await createClient();
  const {
    isCommuteSituationId,
    legacyCycleFieldsFromPattern,
    parseCommutePattern,
  } = await import("@/lib/activity-pattern");
  const patch: Record<string, unknown> = {};
  if (payload.activityLevel) {
    patch.activity_level = payload.activityLevel;
  }
  if (payload.commuteSituation && isCommuteSituationId(payload.commuteSituation)) {
    patch.commute_situation = payload.commuteSituation;
    if (
      payload.commuteSituation === "work_from_home" ||
      payload.commuteSituation === "no_regular_commute"
    ) {
      patch.commute_pattern = [];
      patch.cycle_commute_days_per_week = null;
      patch.cycle_commute_minutes = null;
    }
  }
  if (
    payload.commutePattern &&
    payload.commuteSituation !== "work_from_home" &&
    payload.commuteSituation !== "no_regular_commute"
  ) {
    const pattern = parseCommutePattern(payload.commutePattern);
    patch.commute_pattern = pattern;
    const legacy = legacyCycleFieldsFromPattern(pattern);
    patch.cycle_commute_days_per_week = legacy.cycleCommuteDaysPerWeek;
    patch.cycle_commute_minutes = legacy.cycleCommuteMinutes;
    if (!payload.commuteSituation && pattern.length > 0) {
      patch.commute_situation = "commutes";
    }
  } else if (
    payload.cycleCommuteDaysPerWeek != null ||
    payload.cycleCommuteMinutes != null
  ) {
    const days = payload.cycleCommuteDaysPerWeek;
    const pattern =
      days != null && days > 0
        ? [
            {
              method: "cycling" as const,
              daysPerWeek: days,
              minutesOneWay: payload.cycleCommuteMinutes ?? null,
            },
          ]
        : [];
    patch.commute_pattern = pattern;
    patch.cycle_commute_days_per_week =
      days != null && days > 0 ? days : null;
    patch.cycle_commute_minutes = payload.cycleCommuteMinutes ?? null;
    if (pattern.length > 0) {
      patch.commute_situation = "commutes";
    }
  }
  if (payload.activityPatternNotes != null) {
    patch.activity_pattern_notes = payload.activityPatternNotes;
  }
  if (Object.keys(patch).length === 0) {
    return "Nothing to update for activity.";
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);

  if (error) {
    console.error("[coach-changes] Activity update failed:", error.message);
    return "Activity pattern couldn’t be saved.";
  }

  // Recalculate automatic targets only; manual targets stay put.
  const { data: targets } = await supabase
    .from("nutrition_targets")
    .select("is_manual")
    .eq("user_id", userId)
    .maybeSingle();

  if (targets && targets.is_manual === true) {
    return null;
  }

  const { ensureNutritionTargetsForUser } = await import(
    "@/lib/nutrition-day"
  );
  await ensureNutritionTargetsForUser(supabase, userId, {
    forceRecalculate: true,
  });
  return null;
}

async function applyGoalProposal(
  userId: string,
  payload: GoalProposalPayload,
): Promise<string | null> {
  const supabase = await createClient();
  const today = getLocalLoggedDate();
  const { data: existing } = await supabase
    .from("profiles")
    .select(
      "primary_goal, goal_in_own_words, target_weight_kg, target_date, goal_started_at",
    )
    .eq("id", userId)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (payload.primaryGoal) {
    patch.primary_goal = payload.primaryGoal;
    if (
      !existing ||
      existing.primary_goal !== payload.primaryGoal
    ) {
      patch.goal_started_at = today;
    }
  }
  if (payload.targetDate) {
    patch.target_date = payload.targetDate;
  } else if (payload.durationWeeks != null) {
    const { addDaysIso } = await import("@/lib/programme-deadline");
    patch.target_date = addDaysIso(today, payload.durationWeeks * 7);
  }
  if (payload.targetWeightKg != null) {
    patch.target_weight_kg = payload.targetWeightKg;
  }
  if (payload.goalInOwnWords) {
    patch.goal_in_own_words = payload.goalInOwnWords;
  }
  if (Object.keys(patch).length === 0) {
    return "Nothing to update for goals.";
  }

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId);

  if (error) {
    console.error("[coach-changes] Goal update failed:", error.message);
    return "Goal couldn’t be saved.";
  }

  if (
    payload.primaryGoal &&
    existing &&
    existing.primary_goal !== payload.primaryGoal
  ) {
    if (existing.goal_started_at || existing.primary_goal) {
      await supabase
        .from("goal_history")
        .update({ effective_to: today })
        .eq("user_id", userId)
        .is("effective_to", null);
    }
    await supabase.from("goal_history").insert({
      user_id: userId,
      primary_goal: payload.primaryGoal,
      goal_in_own_words:
        payload.goalInOwnWords ??
        (typeof existing.goal_in_own_words === "string"
          ? existing.goal_in_own_words
          : null),
      target_weight_kg:
        payload.targetWeightKg ??
        (typeof existing.target_weight_kg === "number"
          ? existing.target_weight_kg
          : null),
      target_date:
        (typeof patch.target_date === "string"
          ? patch.target_date
          : null) ??
        (typeof existing.target_date === "string"
          ? existing.target_date
          : null),
      effective_from: today,
      change_reason: "Confirmed with coach",
      source: "coach",
    });
  }

  return null;
}

async function applyWeeklyScheduleProposal(
  userId: string,
  payload: WeeklyScheduleProposalPayload,
): Promise<string | null> {
  const supabase = await createClient();
  const parsed = parseWeeklyScheduleProposalPayload(payload);
  if (!parsed) {
    return "That weekly schedule isn’t valid.";
  }

  const slots: WeeklyScheduleSlot[] = completeWeeklySchedule(
    parsed.slots.map((slot) => ({
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

  const weeksToReseed = parsed.weeksToReseed ?? 2;
  const today = getLocalLoggedDate();
  const weekStart = startOfWeekMonday(today);

  const { data: programme } = await supabase
    .from("training_programmes")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  const templateIdByCode = new Map<string, string>();
  if (programme) {
    const { data: templates } = await supabase
      .from("workout_templates")
      .select("id, code")
      .eq("programme_id", programme.id)
      .eq("user_id", userId);
    for (const row of templates ?? []) {
      const t = row as { id: string; code: string };
      templateIdByCode.set(t.code, t.id);
    }

    await supabase
      .from("programme_week_slots")
      .delete()
      .eq("programme_id", programme.id)
      .eq("user_id", userId);

    for (const slot of slots) {
      if (slot.slotType === "rest") {
        continue;
      }
      await supabase.from("programme_week_slots").insert({
        user_id: userId,
        programme_id: programme.id,
        day_of_week: slot.dayOfWeek,
        slot_type: slot.slotType,
        template_id: slot.templateCode
          ? templateIdByCode.get(slot.templateCode) ?? null
          : null,
        title: slot.title,
        sort_order: 0,
      });
    }
  }

  // Remove only future *planned* entries with no linked session — never rewrite history.
  const windowEnd = addDays(weekStart, weeksToReseed * 7 - 1);
  const { data: futurePlanned } = await supabase
    .from("training_plan_entries")
    .select("id, plan_date, status, training_session_id")
    .eq("user_id", userId)
    .gte("plan_date", today)
    .lte("plan_date", windowEnd)
    .eq("status", "planned");

  const removableIds = (futurePlanned ?? [])
    .filter((row) => {
      const r = row as { training_session_id: string | null };
      return r.training_session_id == null;
    })
    .map((row) => String((row as { id: string }).id));

  if (removableIds.length > 0) {
    await supabase
      .from("training_plan_entries")
      .delete()
      .eq("user_id", userId)
      .in("id", removableIds);
  }

  for (let week = 0; week < weeksToReseed; week += 1) {
    for (const slot of slots) {
      if (slot.slotType === "rest") {
        continue;
      }
      const planDate = addDays(weekStart, week * 7 + slot.dayOfWeek);
      if (planDate < today) {
        continue;
      }

      const trainingType =
        slot.slotType === "strength"
          ? "strength"
          : slot.slotType === "hiit"
            ? "hiit"
            : slot.slotType === "other"
              ? "other"
              : "cardio";

      const { data: existing } = await supabase
        .from("training_plan_entries")
        .select("id, status")
        .eq("user_id", userId)
        .eq("plan_date", planDate)
        .eq("title", slot.title)
        .maybeSingle();
      if (existing) {
        continue;
      }

      await supabase.from("training_plan_entries").insert({
        user_id: userId,
        plan_date: planDate,
        original_plan_date: planDate,
        training_type: trainingType,
        title: slot.title,
        focus: null,
        planned_duration_minutes: slot.plannedDurationMinutes,
        status: "planned",
        sort_order: 0,
        workout_template_id: slot.templateCode
          ? templateIdByCode.get(slot.templateCode) ?? null
          : null,
      });
    }
  }

  const trainingDays = slots.filter((s) => s.slotType !== "rest").length;
  if (trainingDays > 0) {
    await supabase
      .from("profiles")
      .update({ weekly_session_target: trainingDays })
      .eq("id", userId);
  }

  return null;
}

async function applyCoachChangePayload(
  userId: string,
  proposal: CoachChangeProposalRecord,
): Promise<string | null> {
  if (proposal.kind === "nutrition_targets") {
    return applyNutritionProposal(
      userId,
      proposal.payload as NutritionTargetsProposalPayload,
    );
  }
  if (proposal.kind === "programme_phases") {
    return applyProgrammeProposal(
      userId,
      proposal.payload as ProgrammePhasesProposalPayload,
    );
  }
  if (proposal.kind === "activity_pattern") {
    return applyActivityProposal(
      userId,
      proposal.payload as ActivityPatternProposalPayload,
    );
  }
  if (proposal.kind === "weekly_schedule") {
    return applyWeeklyScheduleProposal(
      userId,
      proposal.payload as WeeklyScheduleProposalPayload,
    );
  }
  return applyGoalProposal(userId, proposal.payload as GoalProposalPayload);
}

export async function acceptCoachChangeProposal(input: {
  proposalId: string;
}): Promise<ResolveCoachChangeResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data: row, error } = await supabase
      .from("coach_change_proposals")
      .select(PROPOSAL_SELECT)
      .eq("id", input.proposalId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !row) {
      return { status: "error", message: "That proposal couldn’t be found." };
    }

    const proposal = toCoachChangeProposalRecord(
      row as Record<string, unknown>,
    );
    if (!proposal) {
      return { status: "error", message: "That proposal couldn’t be found." };
    }

    if (proposal.status === "accepted") {
      return { status: "accepted", proposal };
    }
    if (proposal.status !== "pending") {
      return {
        status: "error",
        message: "That proposal is no longer pending.",
      };
    }

    const applyError = await applyCoachChangePayload(user.id, proposal);
    if (applyError) {
      return { status: "error", message: applyError };
    }

    const resolvedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from("coach_change_proposals")
      .update({ status: "accepted", resolved_at: resolvedAt })
      .eq("id", proposal.id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select(PROPOSAL_SELECT)
      .maybeSingle();

    if (updateError || !updated) {
      // Data may have applied; treat concurrent accept as success if already accepted.
      const { data: again } = await supabase
        .from("coach_change_proposals")
        .select(PROPOSAL_SELECT)
        .eq("id", proposal.id)
        .eq("user_id", user.id)
        .maybeSingle();
      const againRecord = again
        ? toCoachChangeProposalRecord(again as Record<string, unknown>)
        : null;
      if (againRecord?.status === "accepted") {
        return { status: "accepted", proposal: againRecord };
      }
      return {
        status: "error",
        message: "The change was applied but confirmation couldn’t be saved.",
      };
    }

    const accepted = toCoachChangeProposalRecord(
      updated as Record<string, unknown>,
    );
    if (!accepted) {
      return { status: "error", message: "Proposal couldn’t be confirmed." };
    }

    await supabase.from("coach_events").insert({
      user_id: user.id,
      event_date: getLocalLoggedDate(),
      event_type:
        proposal.kind === "nutrition_targets"
          ? "nutrition_decision"
          : proposal.kind === "programme_phases" ||
              proposal.kind === "weekly_schedule"
            ? "plan_change"
            : proposal.kind === "goal"
              ? "goal_note"
              : "lifestyle_note",
      summary: `Confirmed: ${
        proposal.reason ?? describeCoachChangeProposal(proposal).join("; ")
      }`.slice(0, 280),
      source_conversation_id: proposal.conversation_id,
      active: true,
    });

    return { status: "accepted", proposal: accepted };
  } catch (error) {
    console.error("[coach-changes] Accept failed:", error);
    return {
      status: "error",
      message: "That change couldn’t be applied. Try again.",
    };
  }
}

export async function rejectCoachChangeProposal(input: {
  proposalId: string;
}): Promise<ResolveCoachChangeResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from("coach_change_proposals")
      .update({
        status: "rejected",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", input.proposalId)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select(PROPOSAL_SELECT)
      .maybeSingle();

    if (error || !updated) {
      return {
        status: "error",
        message: "That proposal couldn’t be rejected.",
      };
    }
    const proposal = toCoachChangeProposalRecord(
      updated as Record<string, unknown>,
    );
    if (!proposal) {
      return {
        status: "error",
        message: "That proposal couldn’t be rejected.",
      };
    }
    return { status: "rejected", proposal };
  } catch {
    return {
      status: "error",
      message: "That proposal couldn’t be rejected.",
    };
  }
}

/** Accept all pending proposals for a conversation (verbal confirmation path). */
export async function acceptPendingCoachChangesForConversation(input: {
  conversationId: string;
}): Promise<{
  status: "ok" | "error";
  accepted: number;
  message?: string;
}> {
  if (!isSupabaseConfigured()) {
    return { status: "error", accepted: 0, message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", accepted: 0, message: "You’re not signed in." };
  }

  const listed = await listPendingCoachChangeProposals({
    conversationId: input.conversationId,
  });
  if (listed.status !== "ok") {
    return { status: "error", accepted: 0, message: listed.message };
  }

  let accepted = 0;
  for (const proposal of listed.proposals) {
    const result = await acceptCoachChangeProposal({
      proposalId: proposal.id,
    });
    if (result.status === "accepted") {
      accepted += 1;
    } else if (result.status === "error") {
      return {
        status: "error",
        accepted,
        message: result.message,
      };
    }
  }
  return { status: "ok", accepted };
}

export { describeCoachChangeProposal };
