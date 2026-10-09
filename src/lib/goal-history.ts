/**
 * Goal change coaching helpers.
 * Keep scripts/verify-profile-goals-progress.mjs in sync.
 */

export type GoalHistoryRecord = {
  id: string;
  primary_goal: string | null;
  goal_in_own_words: string | null;
  target_weight_kg: number | null;
  target_date: string | null;
  effective_from: string;
  effective_to: string | null;
  change_reason: string | null;
  source: "onboarding" | "profile" | "coach" | "weekly_checkin";
  created_at: string;
};

export type GoalChangeWarning = {
  shouldWarn: boolean;
  daysOnPlan: number;
  message: string | null;
};

const RECENT_GOAL_DAYS = 14;

function parseLocalDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function daysBetweenLocalDates(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Warn when switching primary goal after a short time on the current plan.
 * Proportional coaching — never blocks the change.
 */
export function evaluateGoalChangeWarning(input: {
  currentGoal: string | null;
  nextGoal: string | null;
  goalStartedAt: string | null;
  today: string;
}): GoalChangeWarning {
  if (
    !input.currentGoal ||
    !input.nextGoal ||
    input.currentGoal === input.nextGoal
  ) {
    return { shouldWarn: false, daysOnPlan: 0, message: null };
  }
  if (!input.goalStartedAt) {
    return { shouldWarn: false, daysOnPlan: 0, message: null };
  }

  const daysOnPlan = daysBetweenLocalDates(
    input.goalStartedAt,
    input.today,
  );

  if (daysOnPlan >= RECENT_GOAL_DAYS) {
    return { shouldWarn: false, daysOnPlan, message: null };
  }

  return {
    shouldWarn: true,
    daysOnPlan,
    message: `You've been following your current plan for ${daysOnPlan} day${
      daysOnPlan === 1 ? "" : "s"
    }. We may not have enough consistent data yet to judge how well it's working. Before switching goals, would you like to review your progress or adjust your current plan?`,
  };
}
