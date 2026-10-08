/**
 * Today check-in options and deterministic coach fallback.
 *
 * Live AI coaching is generated server-side; getCoachTake() remains the
 * offline/error fallback. Keep returning { text, source }.
 */

export type FeelingId = "strong" | "good" | "flat" | "tired" | "sore";
export type PlanId = "strength" | "hiit" | "recovery" | "rest" | "unsure";
export type SleepScore = 1 | 2 | 3 | 4 | 5;
export type SleepQualityId = "bad" | "okay" | "good" | "very_good";
export type FeelingRating = 1 | 2 | 3 | 4 | 5;
export type SleepHoursOption = 5 | 6 | 7 | 8 | 9;

export type TodayCheckIn = {
  sleepHours: SleepHoursOption | null;
  sleepQuality: SleepQualityId | null;
  feelingRating: FeelingRating | null;
  feeling: FeelingId | null;
  sleep: SleepScore | null;
  plan: PlanId | null;
};

export type CoachTakeSource = "preview" | "gemini";

export type CoachTake = {
  text: string;
  source: CoachTakeSource;
};

export const feelingOptions: { id: FeelingId; label: string }[] = [
  { id: "strong", label: "Feeling strong" },
  { id: "good", label: "Pretty good" },
  { id: "flat", label: "A bit flat" },
  { id: "tired", label: "Tired" },
  { id: "sore", label: "Something's sore" },
];

export const planOptions: { id: PlanId; label: string }[] = [
  { id: "strength", label: "Strength training" },
  { id: "hiit", label: "F45 / HIIT" },
  { id: "recovery", label: "Active recovery" },
  { id: "rest", label: "Rest day" },
  { id: "unsure", label: "Not sure yet" },
];

export const sleepHoursOptions: { id: SleepHoursOption; label: string }[] = [
  { id: 5, label: "5h" },
  { id: 6, label: "6h" },
  { id: 7, label: "7h" },
  { id: 8, label: "8h" },
  { id: 9, label: "9h+" },
];

export const sleepQualityOptions: { id: SleepQualityId; label: string }[] = [
  { id: "bad", label: "Bad" },
  { id: "okay", label: "Okay" },
  { id: "good", label: "Good" },
  { id: "very_good", label: "Very good" },
];

export const feelingRatingOptions: { id: FeelingRating; label: string }[] = [
  { id: 1, label: "1" },
  { id: 2, label: "2" },
  { id: 3, label: "3" },
  { id: 4, label: "4" },
  { id: 5, label: "5" },
];

export function labelForFeeling(id: FeelingId): string {
  return feelingOptions.find((option) => option.id === id)?.label ?? id;
}

export function labelForPlan(id: PlanId): string {
  return planOptions.find((option) => option.id === id)?.label ?? id;
}

export function labelForSleep(score: SleepScore): string {
  if (score === 1) {
    return "1 · Restless";
  }
  if (score === 5) {
    return "5 · Great";
  }
  return `${score} / 5`;
}

export function labelForSleepQuality(id: SleepQualityId): string {
  return sleepQualityOptions.find((option) => option.id === id)?.label ?? id;
}

export function labelForSleepHours(hours: SleepHoursOption): string {
  return hours === 9 ? "9h+" : `${hours}h`;
}

export function sleepQualityToRating(quality: SleepQualityId): SleepScore {
  switch (quality) {
    case "bad":
      return 1;
    case "okay":
      return 3;
    case "good":
      return 4;
    case "very_good":
      return 5;
  }
}

export function feelingRatingToFeeling(rating: FeelingRating): FeelingId {
  if (rating >= 5) {
    return "strong";
  }
  if (rating === 4) {
    return "good";
  }
  if (rating === 3) {
    return "flat";
  }
  return "tired";
}

export function isCheckInComplete(
  checkIn: TodayCheckIn,
): checkIn is {
  sleepHours: SleepHoursOption;
  sleepQuality: SleepQualityId;
  feelingRating: FeelingRating;
  feeling: FeelingId;
  sleep: SleepScore;
  plan: PlanId;
} {
  return (
    checkIn.sleepHours !== null &&
    checkIn.sleepQuality !== null &&
    checkIn.feelingRating !== null &&
    checkIn.feeling !== null &&
    checkIn.sleep !== null &&
    checkIn.plan !== null
  );
}

/** Empty draft for the morning recovery check-in. */
export const emptyTodayCheckIn: TodayCheckIn = {
  sleepHours: null,
  sleepQuality: null,
  feelingRating: null,
  feeling: null,
  sleep: null,
  plan: null,
};

export function getCoachTake(checkIn: TodayCheckIn): CoachTake | null {
  if (
    checkIn.feeling === null ||
    checkIn.sleep === null ||
    checkIn.plan === null
  ) {
    return null;
  }

  const { feeling, sleep, plan, sleepQuality, feelingRating } = checkIn;
  const opener =
    feeling === "sore"
      ? "Respect the sore area today."
      : feeling === "tired" || (feelingRating != null && feelingRating <= 2)
        ? "Energy looks limited — keep the day realistic."
        : feeling === "strong" || (feelingRating != null && feelingRating >= 4)
          ? "You’re in a solid place to make today count."
          : "Steady start — keep the plan practical.";

  const sleepBit =
    sleepQuality === "bad" || sleep <= 2
      ? "Sleep was rough, so protect recovery."
      : sleepQuality === "very_good" || sleep >= 4
        ? "Sleep was decent."
        : "";

  const planBit =
    plan === "rest"
      ? "Lean into rest and protein."
      : plan === "hiit" || plan === "strength"
        ? "Train with intent, not ego."
        : "Keep movement sensible.";

  return {
    source: "preview",
    text: [opener, sleepBit, planBit].filter(Boolean).join(" "),
  };
}

export function getDailyFocus(checkIn: TodayCheckIn): string[] {
  if (!isCheckInComplete(checkIn)) {
    return [];
  }

  const { feeling, sleep, plan } = checkIn;
  const focus: string[] = [];

  if (plan === "rest" || feeling === "sore") {
    focus.push("Keep recovery in mind");
  } else if (plan === "recovery" || plan === "unsure" || feeling === "tired") {
    focus.push("Keep the session focused");
  } else {
    focus.push("Train with intent");
  }

  focus.push("Prioritise protein");

  if (sleep <= 2 || feeling === "tired" || plan === "rest") {
    focus.push("Protect tonight's sleep");
  } else {
    focus.push("Get outside for a walk");
  }

  return focus.slice(0, 4);
}

export function greetingForHour(hour: number, displayName: string): string {
  const time =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (displayName) {
    return `${time}, ${displayName}`;
  }

  return time;
}
