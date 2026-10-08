/**
 * Today check-in options and deterministic coach fallback.
 *
 * Live AI coaching is generated server-side; getCoachTake() remains the
 * offline/error fallback. Keep returning { text, source }.
 */

export type FeelingId = "strong" | "good" | "flat" | "tired" | "sore";
export type PlanId = "strength" | "hiit" | "recovery" | "rest" | "unsure";
export type SleepScore = 1 | 2 | 3 | 4 | 5;

export type TodayCheckIn = {
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

export function isCheckInComplete(
  checkIn: TodayCheckIn,
): checkIn is { feeling: FeelingId; sleep: SleepScore; plan: PlanId } {
  return (
    checkIn.feeling !== null &&
    checkIn.sleep !== null &&
    checkIn.plan !== null
  );
}

export function getCoachTake(checkIn: TodayCheckIn): CoachTake | null {
  if (!isCheckInComplete(checkIn)) {
    return null;
  }

  const { feeling, sleep, plan } = checkIn;
  const sentences = [
    feelingOpener(feeling),
    sleepLine(sleep, plan),
    planLine(feeling, sleep, plan),
  ].filter(Boolean);

  return {
    source: "preview",
    text: sentences.join(" "),
  };
}

function feelingOpener(feeling: FeelingId): string {
  switch (feeling) {
    case "tired":
      return "Got it. You're feeling a little tired today. Let's not force it.";
    case "sore":
      return "Thanks for flagging that. Let's respect it rather than train through it.";
    case "strong":
      return "Good. This sounds like a day to train with intent.";
    case "good":
      return "Good place to start. Let's keep the momentum going and make today productive.";
    case "flat":
      return "That's okay. We don't need every day to feel amazing. Let's keep the plan realistic and build some momentum.";
  }
}

function sleepLine(sleep: SleepScore, plan: PlanId): string {
  const training = plan === "strength" || plan === "hiit";

  if (sleep <= 2 && training) {
    return "Sleep was restless, so we'll keep this more recovery-conscious than usual.";
  }
  if (sleep >= 4 && plan === "strength") {
    return "You slept well, so we can let this session have a bit more intent.";
  }
  if (sleep >= 4 && plan === "hiit") {
    return "You slept well, which will help if you go hard.";
  }
  if (sleep <= 2) {
    return "Sleep was restless, so we'll treat energy as limited.";
  }
  return "";
}

function planLine(
  feeling: FeelingId,
  sleep: SleepScore,
  plan: PlanId,
): string {
  if (feeling === "sore") {
    if (plan === "rest") {
      return "A rest day is a good way to honour that. Keep food solid and let the area settle.";
    }
    if (plan === "unsure") {
      return "We'll work around the sore area. No need to decide on a hard session until it feels right.";
    }
    return "We'll work around the sore area and keep the session productive.";
  }

  if (feeling === "tired" && plan === "hiit") {
    return "If you train, keep the session focused and prioritise quality over volume. HIIT may feel harder today — that's expected.";
  }

  if (feeling === "tired" && plan === "strength") {
    return "If you train, keep the session focused and prioritise quality over volume.";
  }

  if (feeling === "tired" && plan === "rest") {
    return "Rest is the right call. Keep the day easy and don't turn recovery into another task.";
  }

  if (feeling === "tired" && plan === "recovery") {
    return "Keep movement short and easy. Showing up gently is enough.";
  }

  if (feeling === "tired" && plan === "unsure") {
    return "You don't have to decide yet. Default to something light unless you genuinely feel like training.";
  }

  if (feeling === "strong" && plan === "strength") {
    return sleep >= 4
      ? "Let's make the most of it without adding unnecessary volume."
      : "Let's make the most of it, but skip the extra sets you don't need.";
  }

  if (feeling === "strong" && plan === "hiit") {
    return "Let's make the most of it without turning it into a smash session.";
  }

  if (feeling === "strong" && (plan === "rest" || plan === "recovery")) {
    return "If today is meant to be easier, keep it that way — the work will still be there tomorrow.";
  }

  if (plan === "rest") {
    return "Use the rest well: protein, a little daylight, and no guilt for not training.";
  }

  if (plan === "unsure") {
    return "No need to lock the whole day this minute. We'll keep things sensible until the plan is clear.";
  }

  if (plan === "recovery") {
    return "Keep recovery as recovery — easy movement, not a hidden hard session.";
  }

  return "Stay present, hit the work in front of you, and leave a little in the tank.";
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
