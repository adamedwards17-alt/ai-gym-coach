"use server";

import { generateAuthenticatedCoachTake } from "@/lib/ai/get-coach-take";
import type { CoachTakeResult, CompletedCheckIn } from "@/lib/ai/types";
import {
  feelingRatingToFeeling,
  isCheckInComplete,
  sleepQualityToRating,
  type TodayCheckIn,
} from "@/lib/today";
import {
  isFeelingId,
  isFeelingRating,
  isPlanId,
  isSleepHoursOption,
  isSleepQualityId,
  isSleepScore,
} from "@/lib/check-ins";

export async function requestCoachTake(
  input: TodayCheckIn,
): Promise<CoachTakeResult> {
  if (
    !isSleepHoursOption(input.sleepHours) ||
    !isSleepQualityId(input.sleepQuality) ||
    !isFeelingRating(input.feelingRating) ||
    !isPlanId(input.plan)
  ) {
    return {
      source: "preview",
      text: "Keep today sensible. Listen to your body, hit what you can with quality, and protect tonight’s sleep.",
    };
  }

  const sleep =
    input.sleep && isSleepScore(input.sleep)
      ? input.sleep
      : sleepQualityToRating(input.sleepQuality);
  const feeling =
    input.feeling && isFeelingId(input.feeling)
      ? input.feeling
      : feelingRatingToFeeling(input.feelingRating);

  const checkIn: CompletedCheckIn = {
    feeling,
    sleep,
    plan: input.plan,
    sleepHours: input.sleepHours,
    sleepQuality: input.sleepQuality,
    feelingRating: input.feelingRating,
  };

  if (
    !isCheckInComplete({
      feeling: checkIn.feeling,
      sleep: checkIn.sleep,
      plan: checkIn.plan,
      sleepHours: checkIn.sleepHours ?? null,
      sleepQuality: checkIn.sleepQuality ?? null,
      feelingRating: checkIn.feelingRating ?? null,
    })
  ) {
    return {
      source: "preview",
      text: "Keep today sensible. Listen to your body, hit what you can with quality, and protect tonight’s sleep.",
    };
  }

  return generateAuthenticatedCoachTake(checkIn);
}
