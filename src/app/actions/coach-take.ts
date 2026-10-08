"use server";

import { generateAuthenticatedCoachTake } from "@/lib/ai/get-coach-take";
import type { CoachTakeResult, CompletedCheckIn } from "@/lib/ai/types";
import {
  isCheckInComplete,
  type FeelingId,
  type PlanId,
  type SleepScore,
  type TodayCheckIn,
} from "@/lib/today";

function isFeelingId(value: unknown): value is FeelingId {
  return (
    value === "strong" ||
    value === "good" ||
    value === "flat" ||
    value === "tired" ||
    value === "sore"
  );
}

function isPlanId(value: unknown): value is PlanId {
  return (
    value === "strength" ||
    value === "hiit" ||
    value === "recovery" ||
    value === "rest" ||
    value === "unsure"
  );
}

function isSleepScore(value: unknown): value is SleepScore {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export async function requestCoachTake(
  input: TodayCheckIn,
): Promise<CoachTakeResult> {
  if (
    !isFeelingId(input.feeling) ||
    !isSleepScore(input.sleep) ||
    !isPlanId(input.plan)
  ) {
    return {
      source: "preview",
      text: "Keep today sensible. Listen to your body, hit what you can with quality, and protect tonight’s sleep.",
    };
  }

  const checkIn: CompletedCheckIn = {
    feeling: input.feeling,
    sleep: input.sleep,
    plan: input.plan,
  };

  if (!isCheckInComplete(checkIn)) {
    return {
      source: "preview",
      text: "Keep today sensible. Listen to your body, hit what you can with quality, and protect tonight’s sleep.",
    };
  }

  return generateAuthenticatedCoachTake(checkIn);
}
