"use server";

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
  isValidCheckInDate,
  normalizeStoredCoachTake,
  rowToTodayCheckIn,
  type CompletedDailyCheckIn,
  type DailyCheckInRow,
} from "@/lib/check-ins";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type LoadCheckInResult =
  | {
      status: "found";
      checkIn: CompletedDailyCheckIn;
      checkInDate: string;
      coachTake: string | null;
    }
  | { status: "empty"; checkInDate: string }
  | { status: "error"; message: string };

export type SaveCheckInResult =
  | { status: "saved"; checkIn: CompletedDailyCheckIn; checkInDate: string }
  | { status: "error"; message: string };

export type SaveCoachTakeResult =
  | { status: "saved" }
  | { status: "error"; message: string };

const CHECK_IN_SELECT =
  "feeling, sleep_rating, planned_training, check_in_date, coach_take, sleep_hours, sleep_quality, feeling_rating";

function parseCompletedCheckIn(
  input: TodayCheckIn,
): CompletedDailyCheckIn | null {
  if (
    !isSleepHoursOption(input.sleepHours) ||
    !isSleepQualityId(input.sleepQuality) ||
    !isFeelingRating(input.feelingRating) ||
    !isPlanId(input.plan)
  ) {
    return null;
  }

  const sleep =
    input.sleep && isSleepScore(input.sleep)
      ? input.sleep
      : sleepQualityToRating(input.sleepQuality);

  const feeling =
    input.feeling && isFeelingId(input.feeling)
      ? input.feeling
      : feelingRatingToFeeling(input.feelingRating);

  const checkIn: CompletedDailyCheckIn = {
    feeling,
    sleep,
    plan: input.plan,
    sleepHours: input.sleepHours,
    sleepQuality: input.sleepQuality,
    feelingRating: input.feelingRating,
  };

  return isCheckInComplete({
    ...checkIn,
  })
    ? checkIn
    : null;
}

export async function loadTodaysCheckIn(
  checkInDate: string,
): Promise<LoadCheckInResult> {
  if (!isValidCheckInDate(checkInDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so today’s check-in can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      message: "You’re not signed in.",
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("daily_check_ins")
      .select(CHECK_IN_SELECT)
      .eq("user_id", user.id)
      .eq("check_in_date", checkInDate)
      .maybeSingle();

    if (error) {
      console.error("[check-in] Load failed:", error.message);
      return {
        status: "error",
        message: "Today’s check-in couldn’t be loaded. Try again.",
      };
    }

    if (!data) {
      return { status: "empty", checkInDate };
    }

    const row = data as unknown as DailyCheckInRow;
    if (
      !isFeelingId(row.feeling) ||
      !isSleepScore(row.sleep_rating) ||
      !isPlanId(row.planned_training)
    ) {
      console.error("[check-in] Loaded row failed validation");
      return {
        status: "error",
        message: "Today’s check-in couldn’t be loaded. Try again.",
      };
    }

    return {
      status: "found",
      checkInDate,
      checkIn: rowToTodayCheckIn(row),
      coachTake: normalizeStoredCoachTake(row.coach_take),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown check-in load error";
    console.error("[check-in] Load failed:", message);
    return {
      status: "error",
      message: "Today’s check-in couldn’t be loaded. Try again.",
    };
  }
}

/**
 * Upserts today's answers only.
 * Does not include coach_take, so an existing Gemini take is preserved on update.
 */
export async function saveTodaysCheckIn(input: {
  checkInDate: string;
  checkIn: TodayCheckIn;
}): Promise<SaveCheckInResult> {
  if (!isValidCheckInDate(input.checkInDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const checkIn = parseCompletedCheckIn(input.checkIn);
  if (!checkIn) {
    return {
      status: "error",
      message: "Finish sleep, feeling, and today’s plan before saving.",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so today’s check-in couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      message: "You’re not signed in.",
    };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("daily_check_ins").upsert(
      {
        user_id: user.id,
        check_in_date: input.checkInDate,
        feeling: checkIn.feeling,
        sleep_rating: checkIn.sleep,
        planned_training: checkIn.plan,
        sleep_hours: checkIn.sleepHours,
        sleep_quality: checkIn.sleepQuality,
        feeling_rating: checkIn.feelingRating,
      },
      { onConflict: "user_id,check_in_date" },
    );

    if (error) {
      console.error("[check-in] Save failed:", error.message);
      return {
        status: "error",
        message: "Today’s check-in couldn’t be saved. Try again.",
      };
    }

    return {
      status: "saved",
      checkInDate: input.checkInDate,
      checkIn,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown check-in save error";
    console.error("[check-in] Save failed:", message);
    return {
      status: "error",
      message: "Today’s check-in couldn’t be saved. Try again.",
    };
  }
}

/** Writes a successful Gemini take only — never called for deterministic preview. */
export async function saveTodaysCoachTake(input: {
  checkInDate: string;
  coachTake: string;
}): Promise<SaveCoachTakeResult> {
  if (!isValidCheckInDate(input.checkInDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const coachTake = normalizeStoredCoachTake(input.coachTake);
  if (!coachTake) {
    return { status: "error", message: "Coach’s Take was empty." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so Coach’s Take couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("daily_check_ins")
      .update({ coach_take: coachTake })
      .eq("user_id", user.id)
      .eq("check_in_date", input.checkInDate);

    if (error) {
      console.error("[check-in] Coach take save failed:", error.message);
      return {
        status: "error",
        message: "Coach’s Take couldn’t be saved. Try again.",
      };
    }

    return { status: "saved" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown coach-take save error";
    console.error("[check-in] Coach take save failed:", message);
    return {
      status: "error",
      message: "Coach’s Take couldn’t be saved. Try again.",
    };
  }
}
