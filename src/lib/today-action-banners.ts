/**
 * Today action banners — max two, derived from Coach Moments + plan entries.
 * Keep scripts/verify-today-action-banners.mjs in sync.
 */

import type { CoachMoment, CoachMomentInput } from "@/lib/coach-moment";
import { collectCoachMomentCandidates } from "@/lib/coach-moment";
import type { MealTypeId } from "@/lib/nutrition";
import type { TodayPlanWorkout } from "@/lib/today-coaching-summary";
import { labelForTrainingType } from "@/lib/training";

export type TodayActionBannerHref =
  | "/nutrition"
  | `/nutrition?meal=${MealTypeId}`
  | "/train"
  | "/coach"
  | "/today#check-in";

export type TodayActionBanner = {
  /** Stable id for same-day dismissal, e.g. meal:lunch, training:abc, check_in. */
  id: string;
  title: string;
  description: string | null;
  actionLabel: string;
  href: TodayActionBannerHref | null;
  /** When href is null, the UI opens the check-in panel. */
  opensCheckIn: boolean;
  kind: "meal" | "training" | "check_in" | "habit";
  priority: number;
  /** Habit banners only — lets the UI reuse the existing habit log flow. */
  habitKey?: string;
};

export type ResolveTodayActionBannersInput = CoachMomentInput & {
  planEntries: TodayPlanWorkout[];
  dismissedIds?: string[];
  maxBanners?: number;
};

function incompleteTraining(
  entries: TodayPlanWorkout[],
): TodayPlanWorkout[] {
  return entries.filter(
    (entry) =>
      entry.training_type !== "rest" && entry.status === "planned",
  );
}

function trainingBanner(
  entries: TodayPlanWorkout[],
  moment: CoachMoment,
  now: Date,
): TodayActionBanner | null {
  const incomplete = incompleteTraining(entries);
  if (incomplete.length === 0) {
    return null;
  }

  const first = incomplete[0];
  const typeLabel = labelForTrainingType(first.training_type).toLowerCase();
  const lateDay = now.getHours() >= 17;

  if (incomplete.length === 1) {
    return {
      id: `training:${first.id}`,
      title: lateDay
        ? `Log your completed ${typeLabel} workout.`
        : `You’ve got a ${typeLabel} workout planned today.`,
      description: first.title ? first.title : moment.description,
      actionLabel: lateDay ? "Log workout" : "Complete workout",
      href: "/train",
      opensCheckIn: false,
      kind: "training",
      priority: Math.max(moment.priority, 70),
    };
  }

  return {
    id: `training:multi:${incomplete.map((e) => e.id).sort().join(",")}`,
    title: lateDay
      ? `Log your remaining ${incomplete.length} sessions.`
      : `You’ve got ${incomplete.length} sessions still planned today.`,
    description: incomplete
      .slice(0, 2)
      .map((e) => e.title || labelForTrainingType(e.training_type))
      .join(" · "),
    actionLabel: "Open Train",
    href: "/train",
    opensCheckIn: false,
    kind: "training",
    priority: Math.max(moment.priority, 70),
  };
}

function mealBanner(moment: CoachMoment): TodayActionBanner | null {
  if (
    moment.type !== "breakfast" &&
    moment.type !== "lunch" &&
    moment.type !== "snack" &&
    moment.type !== "dinner"
  ) {
    return null;
  }

  const meal = moment.type;
  const title =
    meal === "lunch"
      ? "Don’t forget to log your lunch."
      : meal === "breakfast"
        ? "Don’t forget to log your breakfast."
        : meal === "dinner"
          ? "Don’t forget to log your dinner."
          : "Don’t forget to log a snack if you’ve had one.";

  return {
    id: `meal:${meal}`,
    title,
    description: null,
    actionLabel: `Log ${meal}`,
    href: `/nutrition?meal=${meal}`,
    opensCheckIn: false,
    kind: "meal",
    priority: moment.priority,
  };
}

function checkInBanner(moment: CoachMoment): TodayActionBanner {
  return {
    id: "check_in",
    title: "Complete today’s check-in",
    description: moment.description,
    actionLabel: "Start check-in",
    href: null,
    opensCheckIn: true,
    kind: "check_in",
    priority: moment.priority,
  };
}

function habitBanner(moment: CoachMoment): TodayActionBanner | null {
  if (moment.type !== "habit" || !moment.habitKey) {
    return null;
  }
  return {
    id: `habit:${moment.habitKey}`,
    title: moment.title,
    description: moment.description,
    actionLabel: "Log it",
    href: null,
    opensCheckIn: false,
    kind: "habit",
    priority: moment.priority,
    habitKey: moment.habitKey,
  };
}

function momentToBanner(
  moment: CoachMoment,
  planEntries: TodayPlanWorkout[],
  now: Date,
): TodayActionBanner | null {
  if (moment.kind === "observation") {
    return null;
  }
  if (moment.type === "morning_check_in") {
    return checkInBanner(moment);
  }
  if (moment.type === "training") {
    return trainingBanner(planEntries, moment, now);
  }
  if (moment.type === "habit") {
    return habitBanner(moment);
  }
  return mealBanner(moment);
}

/**
 * Resolve up to `maxBanners` actionable banners for Today.
 * Uses Coach Moment candidates — does not invent a separate priority engine.
 */
export function resolveTodayActionBanners(
  input: ResolveTodayActionBannersInput,
): TodayActionBanner[] {
  const max = input.maxBanners ?? 2;
  const dismissed = new Set(input.dismissedIds ?? []);
  const incomplete = incompleteTraining(input.planEntries);

  // Drive training reminders from plan entries (source of truth).
  const momentInput: CoachMomentInput = {
    ...input,
    hasTrainingSession: incomplete.length === 0,
    plannedTraining:
      incomplete.length > 0
        ? incomplete[0].training_type === "strength" ||
          incomplete[0].training_type === "hiit" ||
          incomplete[0].training_type === "recovery"
          ? incomplete[0].training_type
          : "unsure"
        : input.plannedTraining,
  };

  const candidates = collectCoachMomentCandidates(momentInput);
  const banners: TodayActionBanner[] = [];
  const seenKinds = new Set<string>();

  for (const moment of candidates) {
    const banner = momentToBanner(moment, input.planEntries, input.now);
    if (!banner) {
      continue;
    }
    if (dismissed.has(banner.id)) {
      continue;
    }
    // One banner per kind family (avoid meal+meal doubling).
    if (banner.kind === "meal") {
      if ([...seenKinds].some((k) => k.startsWith("meal:"))) {
        continue;
      }
      seenKinds.add(`meal:${banner.id}`);
    } else if (seenKinds.has(banner.kind)) {
      continue;
    } else {
      seenKinds.add(banner.kind);
    }
    banners.push(banner);
    if (banners.length >= max) {
      break;
    }
  }

  return banners.slice(0, max);
}
