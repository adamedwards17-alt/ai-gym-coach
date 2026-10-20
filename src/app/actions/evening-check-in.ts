"use server";

import { cookies } from "next/headers";
import { isLocalPreviewActive, getCurrentUser } from "@/lib/auth/session";
import { resolveTimeZone, zonedClock } from "@/lib/coaching-notifications";
import {
  eveningCanFinish,
  emptyEveningAnswers,
  isEveningDateAllowed,
  parseEveningAnswers,
  type EveningAnswers,
  type EveningDay,
  type EveningWorkout,
} from "@/lib/evening-check-in";
import { previewTrainingHub } from "@/lib/local-preview-data";
import { loadNutritionDay } from "@/app/actions/nutrition";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const PREVIEW_COOKIE = "ai-gym-coach-evening-preview";

export type EveningCheckInPayload = {
  date: string;
  answers: EveningAnswers;
  day: EveningDay;
};

export type LoadEveningResult =
  | { status: "ok"; data: EveningCheckInPayload }
  | { status: "error"; message: string };

const TRAINING = new Set(["strength", "hiit", "cardio", "sport"]);

function previewAnswers(raw: string | undefined, date: string): EveningAnswers {
  if (!raw) {
    return emptyEveningAnswers();
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parseEveningAnswers(parsed[date]) ?? emptyEveningAnswers();
  } catch {
    return emptyEveningAnswers();
  }
}

function workoutFromSession(row: {
  title?: string | null;
  training_type?: string | null;
  duration_minutes?: number | null;
}): EveningWorkout | null {
  if (!row.training_type || !TRAINING.has(row.training_type)) {
    return null;
  }
  return {
    title: row.title?.trim() || "Workout",
    trainingType: row.training_type,
    durationMinutes:
      typeof row.duration_minutes === "number" ? row.duration_minutes : null,
  };
}

async function resolveDate(date: string | null): Promise<
  | { status: "ok"; date: string; timeZone: string; preview: boolean }
  | { status: "error"; message: string }
> {
  const preview = await isLocalPreviewActive();
  const timeZone = preview
    ? "Europe/London"
    : await (async () => {
        const user = await getCurrentUser();
        if (!user) {
          return null;
        }
        if (!isSupabaseConfigured()) {
          return resolveTimeZone(null);
        }
        const supabase = await createClient();
        const { data } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", user.id)
          .maybeSingle();
        return resolveTimeZone(
          typeof data?.timezone === "string" ? data.timezone : null,
        );
      })();
  if (!timeZone) {
    return { status: "error", message: "You’re not signed in." };
  }
  const today = zonedClock(new Date(), timeZone).date;
  const resolved = date && date.length > 0 ? date : today;
  if (!isEveningDateAllowed(resolved, new Date(), timeZone)) {
    return { status: "error", message: "That check-in date isn’t available." };
  }
  return { status: "ok", date: resolved, timeZone, preview };
}

export async function loadEveningCheckIn(
  date: string | null,
): Promise<LoadEveningResult> {
  const resolved = await resolveDate(date);
  if (resolved.status !== "ok") {
    return resolved;
  }

  if (resolved.preview) {
    const hub = previewTrainingHub(resolved.date);
    const nutrition = await loadNutritionDay(resolved.date);
    if (nutrition.status !== "ok") {
      return { status: "error", message: nutrition.message };
    }
    const session = hub.weekSessions.find(
      (item) => item.session_date === resolved.date,
    );
    const store = await cookies();
    const planned = hub.todayPlans.find(
      (entry) => entry.training_type !== "rest" && entry.status !== "completed",
    );
    const day: EveningDay = {
      meals: [
        ...nutrition.summary.eatenEntries,
        ...nutrition.summary.plannedEntries,
      ],
      loggedWorkout: session ? workoutFromSession(session) : null,
      plannedTitle: planned?.title ?? null,
      morningEnergy: 4,
      morningSleep: "good",
    };
    return {
      status: "ok",
      data: {
        date: resolved.date,
        answers: previewAnswers(store.get(PREVIEW_COOKIE)?.value, resolved.date),
        day,
      },
    };
  }

  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const nutrition = await loadNutritionDay(resolved.date);
  if (nutrition.status !== "ok") {
    return { status: "error", message: nutrition.message };
  }

  const supabase = await createClient();
  const [checkIn, sessions, plans] = await Promise.all([
    supabase
      .from("daily_check_ins")
      .select("feeling_rating, sleep_quality, evening_review")
      .eq("user_id", user.id)
      .eq("check_in_date", resolved.date)
      .maybeSingle(),
    supabase
      .from("training_sessions")
      .select("title, training_type, duration_minutes")
      .eq("user_id", user.id)
      .eq("session_date", resolved.date)
      .order("created_at", { ascending: false }),
    supabase
      .from("training_plan_entries")
      .select("title, training_type, status")
      .eq("user_id", user.id)
      .eq("plan_date", resolved.date),
  ]);

  if (checkIn.error || sessions.error || plans.error) {
    console.error(
      "[evening] Load failed:",
      checkIn.error?.message ?? sessions.error?.message ?? plans.error?.message,
    );
    return { status: "error", message: "The evening check-in couldn’t be loaded." };
  }

  const rating = checkIn.data?.feeling_rating;
  const sleep = checkIn.data?.sleep_quality;
  const logged = (sessions.data ?? [])
    .map((row) => workoutFromSession(row))
    .find((row): row is EveningWorkout => row !== null);

  return {
    status: "ok",
    data: {
      date: resolved.date,
      answers: parseEveningAnswers(checkIn.data?.evening_review) ?? emptyEveningAnswers(),
      day: {
        meals: [
          ...nutrition.summary.eatenEntries,
          ...nutrition.summary.plannedEntries,
        ],
        loggedWorkout: logged ?? null,
        plannedTitle:
          (plans.data ?? []).find(
            (row) =>
              row.training_type !== "rest" &&
              row.status !== "completed" &&
              typeof row.title === "string",
          )?.title ?? null,
        morningEnergy: typeof rating === "number" ? rating : null,
        morningSleep: typeof sleep === "string" ? sleep : null,
      },
    },
  };
}

export async function saveEveningCheckIn(input: {
  date: string;
  answers: EveningAnswers;
  complete?: boolean;
}): Promise<LoadEveningResult> {
  const current = await loadEveningCheckIn(input.date);
  if (current.status !== "ok") {
    return current;
  }
  const parsed = parseEveningAnswers(input.answers);
  if (!parsed) {
    return { status: "error", message: "Those answers couldn’t be saved." };
  }
  if (current.data.answers.completedAt) {
    return current;
  }

  const next: EveningAnswers = {
    ...parsed,
    meals: parsed.meals,
    completedAt: null,
  };
  if (input.complete) {
    if (!eveningCanFinish(current.data.day, next)) {
      return {
        status: "error",
        message: "There’s still something to answer before finishing.",
      };
    }
    next.completedAt = new Date().toISOString();
  }

  if (await isLocalPreviewActive()) {
    const store = await cookies();
    let bag: Record<string, unknown> = {};
    try {
      bag = JSON.parse(store.get(PREVIEW_COOKIE)?.value ?? "{}") as Record<
        string,
        unknown
      >;
    } catch {
      bag = {};
    }
    bag[current.data.date] = next;
    store.set(PREVIEW_COOKIE, JSON.stringify(bag), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: false,
      maxAge: 60 * 60 * 12,
    });
    return { status: "ok", data: { ...current.data, answers: next } };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("daily_check_ins")
    .select("planned_training")
    .eq("user_id", user.id)
    .eq("check_in_date", current.data.date)
    .maybeSingle();
  if (readError) {
    console.error("[evening] Save read failed:", readError.message);
    return { status: "error", message: "The evening check-in couldn’t be saved." };
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    check_in_date: current.data.date,
    evening_review: next,
  };
  if (
    next.training === "rest" &&
    (existing?.planned_training == null || existing.planned_training === "unsure")
  ) {
    payload.planned_training = "rest";
  }

  const { error } = await supabase
    .from("daily_check_ins")
    .upsert(payload, { onConflict: "user_id,check_in_date" });
  if (error) {
    console.error("[evening] Save failed:", error.message);
    return { status: "error", message: "The evening check-in couldn’t be saved." };
  }

  return { status: "ok", data: { ...current.data, answers: next } };
}
