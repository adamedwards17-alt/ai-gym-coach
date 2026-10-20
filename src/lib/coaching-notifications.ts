/**
 * Coaching notification rules.
 *
 * Timing: a purpose uses its default window until there are at least
 * PATTERN_MIN_SAMPLES timestamps for that activity in the previous
 * PATTERN_LOOKBACK_DAYS, excluding today. The learned window is the median
 * local minute, 45 minutes before through 90 minutes after, clamped so it
 * cannot fall in quiet hours (21:30–07:00). One or two observations never
 * move the window.
 *
 * A missing meal or workout log is not treated as a missed activity.
 * Notification text never includes portions, calories, protein grams, or
 * body measurements.
 */

export const COACHING_DAILY_LIMIT = 2;
export const COACHING_COOLDOWN_MS = 3 * 60 * 60 * 1000;
export const PATTERN_MIN_SAMPLES = 5;
export const PATTERN_LOOKBACK_DAYS = 28;
export const RECENT_MEAL_MS = 3 * 60 * 60 * 1000;
export const DEFAULT_TIME_ZONE = "Europe/London";
export const QUIET_START_MINUTES = 21 * 60 + 30;
export const QUIET_END_MINUTES = 7 * 60;

export const COACHING_PURPOSES = [
  "morning_intention",
  "nutrition",
  "workout",
  "evening_wrapup",
] as const;

export type CoachingPurpose = (typeof COACHING_PURPOSES)[number];

const PRIORITY: CoachingPurpose[] = [
  "workout",
  "morning_intention",
  "nutrition",
  "evening_wrapup",
];

const TRAINING_TYPES = new Set(["strength", "hiit", "cardio", "sport"]);

type Window = { start: number; end: number };

const DEFAULT_WINDOWS: Record<CoachingPurpose, Window> = {
  morning_intention: { start: 7 * 60, end: 10 * 60 },
  nutrition: { start: 15 * 60, end: 18 * 60 + 30 },
  workout: { start: 16 * 60 + 30, end: 20 * 60 },
  evening_wrapup: { start: 20 * 60, end: 21 * 60 + 15 },
};

const LEARNED_BANDS: Record<CoachingPurpose, Window> = {
  morning_intention: { start: 6 * 60, end: 11 * 60 },
  nutrition: { start: 11 * 60, end: 19 * 60 + 30 },
  workout: { start: 11 * 60, end: 20 * 60 + 30 },
  evening_wrapup: { start: 18 * 60, end: 21 * 60 + 20 },
};

export type CoachingCheckIn = {
  checkInDate: string;
  createdAt: string;
  plannedTraining: string;
};

export type CoachingMeal = {
  loggedDate: string;
  createdAt: string;
  status: string;
  proteinG: number | null;
};

export type CoachingSession = {
  sessionDate: string;
  createdAt: string;
  trainingType: string;
};

export type CoachingPlanEntry = {
  planDate: string;
  trainingType: string;
  status: string;
};

export type CoachingMessage = {
  createdAt: string;
};

export type CoachingEvent = {
  purpose: string;
  status: string;
  createdAt: string;
  localDate: string;
};

export type CoachingFacts = {
  userId: string;
  timeZone: string;
  coachingEnabled: boolean;
  now: Date;
  checkIns: CoachingCheckIn[];
  meals: CoachingMeal[];
  sessions: CoachingSession[];
  planEntries: CoachingPlanEntry[];
  proteinTargetG: number | null;
  coachMessages: CoachingMessage[];
  events: CoachingEvent[];
};

export type CoachingDecision = {
  purpose: CoachingPurpose;
  title: string;
  body: string;
  url: string;
};

export type ZonedClock = {
  date: string;
  minutes: number;
};

export function isCoachingPurpose(value: string): value is CoachingPurpose {
  return (COACHING_PURPOSES as readonly string[]).includes(value);
}

export function resolveTimeZone(value: string | null | undefined): string {
  const trimmed = value?.trim() || DEFAULT_TIME_ZONE;
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: trimmed }).format(new Date());
    return trimmed;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export function zonedClock(now: Date, timeZone: string): ZonedClock {
  const zone = resolveTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const pick = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  let hour = Number(pick("hour"));
  const minute = Number(pick("minute"));
  if (hour === 24) {
    hour = 0;
  }
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    minutes: hour * 60 + minute,
  };
}

export function shiftCalendarDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function isQuietMinutes(minutes: number): boolean {
  return minutes >= QUIET_START_MINUTES || minutes < QUIET_END_MINUTES;
}

export function coachingDedupeKey(
  userId: string,
  purpose: CoachingPurpose,
  localDate: string,
): string {
  return `${userId}:${purpose}:${localDate}`;
}

export function claimCoachingDedupe(claimed: Set<string>, key: string): boolean {
  if (claimed.has(key)) {
    return false;
  }
  claimed.add(key);
  return true;
}

export function countsAsCoachingSend(event: {
  purpose: string;
  status: string;
}): boolean {
  return event.status === "sent" && isCoachingPurpose(event.purpose);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

function learnedWindow(
  samples: number[],
  purpose: CoachingPurpose,
): Window | null {
  if (samples.length < PATTERN_MIN_SAMPLES) {
    return null;
  }
  const center = median(samples);
  const band = LEARNED_BANDS[purpose];
  const start = Math.max(center - 45, band.start, QUIET_END_MINUTES);
  const end = Math.min(center + 90, band.end, QUIET_START_MINUTES);
  if (end - start < 30) {
    return null;
  }
  return { start, end };
}

function samplesFor(
  facts: CoachingFacts,
  clock: ZonedClock,
  purpose: CoachingPurpose,
): number[] {
  const earliest = shiftCalendarDate(clock.date, -PATTERN_LOOKBACK_DAYS);
  const stamps =
    purpose === "morning_intention"
      ? facts.checkIns.map((row) => row.createdAt)
      : purpose === "nutrition"
        ? facts.meals
            .filter((row) => row.status === "eaten")
            .map((row) => row.createdAt)
        : purpose === "workout"
          ? facts.sessions
              .filter((row) => TRAINING_TYPES.has(row.trainingType))
              .map((row) => row.createdAt)
          : facts.coachMessages.map((row) => row.createdAt);

  const minutes: number[] = [];
  for (const stamp of stamps) {
    const zoned = zonedClock(new Date(stamp), facts.timeZone);
    if (zoned.date <= earliest || zoned.date >= clock.date) {
      continue;
    }
    if (purpose === "evening_wrapup" && zoned.minutes < 17 * 60) {
      continue;
    }
    minutes.push(zoned.minutes);
  }
  return minutes;
}

export function windowFor(
  facts: CoachingFacts,
  clock: ZonedClock,
  purpose: CoachingPurpose,
): Window {
  return learnedWindow(samplesFor(facts, clock, purpose), purpose) ??
    DEFAULT_WINDOWS[purpose];
}

function inWindow(minutes: number, window: Window): boolean {
  return minutes >= window.start && minutes < window.end;
}

function activityLabel(trainingType: string): string {
  if (trainingType === "strength") {
    return "weights";
  }
  if (trainingType === "hiit") {
    return "a class";
  }
  if (trainingType === "cardio") {
    return "cardio";
  }
  return "your session";
}

type DayPlan = {
  kind: "none" | "rest" | "training";
  activity: string | null;
  completed: boolean;
};

function dayPlan(facts: CoachingFacts, clock: ZonedClock): DayPlan {
  const entries = facts.planEntries.filter((row) => row.planDate === clock.date);
  if (entries.length > 0) {
    const pending = entries.filter(
      (row) => row.status === "planned" && !["rest", "recovery"].includes(row.trainingType),
    );
    if (pending.length > 0) {
      return {
        kind: "training",
        activity: activityLabel(pending[0].trainingType),
        completed: false,
      };
    }
    const finished = entries.filter(
      (row) =>
        TRAINING_TYPES.has(row.trainingType) && row.status === "completed",
    );
    if (finished.length > 0) {
      return {
        kind: "training",
        activity: activityLabel(finished[0].trainingType),
        completed: true,
      };
    }
    if (entries.some((row) => row.trainingType === "rest" && row.status === "planned")) {
      return { kind: "rest", activity: null, completed: false };
    }
    return { kind: "none", activity: null, completed: false };
  }

  const checkIn = facts.checkIns.find((row) => row.checkInDate === clock.date);
  if (!checkIn) {
    return { kind: "none", activity: null, completed: false };
  }
  if (checkIn.plannedTraining === "rest" || checkIn.plannedTraining === "recovery") {
    return { kind: "rest", activity: null, completed: false };
  }
  if (checkIn.plannedTraining === "strength" || checkIn.plannedTraining === "hiit") {
    return {
      kind: "training",
      activity: activityLabel(checkIn.plannedTraining),
      completed: false,
    };
  }
  return { kind: "none", activity: null, completed: false };
}

function workoutLogged(facts: CoachingFacts, clock: ZonedClock): boolean {
  return facts.sessions.some(
    (row) =>
      row.sessionDate === clock.date && TRAINING_TYPES.has(row.trainingType),
  );
}

function checkInToday(facts: CoachingFacts, clock: ZonedClock): boolean {
  return facts.checkIns.some((row) => row.checkInDate === clock.date);
}

function eatenToday(facts: CoachingFacts, clock: ZonedClock): CoachingMeal[] {
  return facts.meals.filter(
    (row) => row.loggedDate === clock.date && row.status === "eaten",
  );
}

function proteinReached(facts: CoachingFacts, clock: ZonedClock): boolean {
  if (facts.proteinTargetG == null) {
    return false;
  }
  const known = eatenToday(facts, clock).filter((row) => row.proteinG != null);
  if (known.length === 0) {
    return false;
  }
  const total = known.reduce((sum, row) => sum + (row.proteinG ?? 0), 0);
  return total >= facts.proteinTargetG;
}

function recentMeal(facts: CoachingFacts, clock: ZonedClock): boolean {
  const stamps = eatenToday(facts, clock).map((row) => new Date(row.createdAt).getTime());
  if (stamps.length === 0) {
    return false;
  }
  const latest = Math.max(...stamps);
  return facts.now.getTime() - latest < RECENT_MEAL_MS;
}

function eveningDone(facts: CoachingFacts, clock: ZonedClock): boolean {
  const lateMessage = facts.coachMessages.some((row) => {
    const zoned = zonedClock(new Date(row.createdAt), facts.timeZone);
    return zoned.date === clock.date && zoned.minutes >= 17 * 60;
  });
  if (lateMessage) {
    return true;
  }
  return facts.checkIns.some((row) => {
    if (row.checkInDate !== clock.date) {
      return false;
    }
    const zoned = zonedClock(new Date(row.createdAt), facts.timeZone);
    return zoned.minutes >= 17 * 60;
  });
}

function eligible(
  purpose: CoachingPurpose,
  facts: CoachingFacts,
  clock: ZonedClock,
): boolean {
  const plan = dayPlan(facts, clock);
  const logged = workoutLogged(facts, clock);
  if (purpose === "morning_intention") {
    return !checkInToday(facts, clock) && !logged && !plan.completed;
  }
  if (purpose === "workout") {
    return plan.kind === "training" && !plan.completed && !logged;
  }
  if (purpose === "nutrition") {
    return !proteinReached(facts, clock) && !recentMeal(facts, clock);
  }
  return !eveningDone(facts, clock);
}

function decisionFor(
  purpose: CoachingPurpose,
  facts: CoachingFacts,
  clock: ZonedClock,
): CoachingDecision {
  const plan = dayPlan(facts, clock);
  if (purpose === "morning_intention") {
    const body =
      plan.kind === "rest"
        ? "Morning. Today looks like rest. Want to confirm the plan?"
        : plan.kind === "training" && plan.activity === "weights"
          ? "Morning. What's the plan today: weights, or a lighter session?"
          : plan.kind === "training" && plan.activity === "a class"
            ? "Morning. What's the plan today: a class, or recovery?"
            : "Morning. What's the plan today: weights, a class, or recovery?";
    return {
      purpose,
      title: "AI Gym Coach",
      body,
      url: "/today",
    };
  }
  if (purpose === "nutrition") {
    return {
      purpose,
      title: "AI Gym Coach",
      body: "How's protein looking today? Tell me what you've eaten and I'll help you plan dinner.",
      url: "/coach?intent=protein",
    };
  }
  if (purpose === "workout") {
    const body =
      plan.activity === "weights"
        ? "You had weights planned today. Still time for your session, or should we make a smaller plan?"
        : "You had a session planned today. Still time for it, or should we make a smaller plan?";
    return {
      purpose,
      title: "AI Gym Coach",
      body,
      url: "/train",
    };
  }
  return {
    purpose,
    title: "AI Gym Coach",
    body: "Quick check-in: how did today go? Let's make tomorrow a good one.",
    url: "/coach?intent=evening",
  };
}

export function decideCoachingNotification(
  facts: CoachingFacts,
): CoachingDecision | null {
  if (!facts.coachingEnabled) {
    return null;
  }
  const clock = zonedClock(facts.now, facts.timeZone);
  if (isQuietMinutes(clock.minutes)) {
    return null;
  }

  const todayEvents = facts.events.filter(
    (event) => event.localDate === clock.date && isCoachingPurpose(event.purpose),
  );
  const sent = todayEvents.filter((event) => event.status === "sent");
  if (sent.length >= COACHING_DAILY_LIMIT) {
    return null;
  }
  const latestSent = sent
    .map((event) => new Date(event.createdAt).getTime())
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => b - a)[0];
  if (
    latestSent != null &&
    facts.now.getTime() - latestSent < COACHING_COOLDOWN_MS
  ) {
    return null;
  }

  const attempted = new Set(todayEvents.map((event) => event.purpose));
  for (const purpose of PRIORITY) {
    if (attempted.has(purpose)) {
      continue;
    }
    if (!eligible(purpose, facts, clock)) {
      continue;
    }
    if (!inWindow(clock.minutes, windowFor(facts, clock, purpose))) {
      continue;
    }
    return decisionFor(purpose, facts, clock);
  }
  return null;
}

const DISALLOWED_COPY = [
  "haven't eaten",
  "have not eaten",
  "didn't eat",
  "did not eat",
  "missed",
  "calorie",
  "grams",
];

export function notificationCopyIsSafe(body: string): boolean {
  const lowered = body.toLowerCase();
  return !DISALLOWED_COPY.some((phrase) => lowered.includes(phrase)) && !/\d/.test(body);
}
