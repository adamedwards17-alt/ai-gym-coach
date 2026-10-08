"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isTrainingTypeId,
  isValidSessionDate,
  type TrainingSessionRecord,
  type TrainingTypeId,
} from "@/lib/training";

export type ListTrainingResult =
  | { status: "ok"; sessions: TrainingSessionRecord[] }
  | { status: "error"; message: string };

export type SaveTrainingResult =
  | { status: "saved"; session: TrainingSessionRecord }
  | { status: "error"; message: string };

const SESSION_SELECT =
  "id, session_date, training_type, title, duration_minutes, notes, created_at";

function toSessionRecord(row: Record<string, unknown>): TrainingSessionRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.session_date !== "string" ||
    !isTrainingTypeId(row.training_type) ||
    typeof row.title !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  const duration =
    row.duration_minutes === null || row.duration_minutes === undefined
      ? null
      : Number(row.duration_minutes);

  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
    return null;
  }

  return {
    id: row.id,
    session_date: row.session_date,
    training_type: row.training_type,
    title: row.title,
    duration_minutes: duration,
    notes: typeof row.notes === "string" ? row.notes : null,
    created_at: row.created_at,
  };
}

export async function listRecentTrainingSessions(
  limit = 8,
): Promise<ListTrainingResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so training history can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("training_sessions")
      .select(SESSION_SELECT)
      .eq("user_id", user.id)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 30));

    if (error) {
      console.error("[training] List failed:", error.message);
      return {
        status: "error",
        message: "Training history couldn’t be loaded. Try again.",
      };
    }

    const sessions = (data ?? [])
      .map((row) => toSessionRecord(row as Record<string, unknown>))
      .filter((session): session is TrainingSessionRecord => session !== null);

    return { status: "ok", sessions };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown training list error";
    console.error("[training] List failed:", message);
    return {
      status: "error",
      message: "Training history couldn’t be loaded. Try again.",
    };
  }
}

export async function saveTrainingSession(input: {
  sessionDate: string;
  trainingType: TrainingTypeId;
  title: string;
  durationMinutes: number | null;
  notes?: string | null;
}): Promise<SaveTrainingResult> {
  if (!isValidSessionDate(input.sessionDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isTrainingTypeId(input.trainingType)) {
    return { status: "error", message: "Choose what you trained." };
  }

  const title = input.title.trim();
  if (!title) {
    return { status: "error", message: "Add a short description of the session." };
  }

  if (
    input.durationMinutes !== null &&
    (!Number.isFinite(input.durationMinutes) ||
      input.durationMinutes <= 0 ||
      input.durationMinutes > 600)
  ) {
    return { status: "error", message: "That duration isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the session couldn’t be saved.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("training_sessions")
      .insert({
        user_id: user.id,
        session_date: input.sessionDate,
        training_type: input.trainingType,
        title,
        duration_minutes: input.durationMinutes,
        notes,
      })
      .select(SESSION_SELECT)
      .single();

    if (error || !data) {
      console.error("[training] Save failed:", error?.message ?? "No row returned");
      return {
        status: "error",
        message: "That session couldn’t be saved. Try again.",
      };
    }

    const session = toSessionRecord(data as Record<string, unknown>);
    if (!session) {
      return {
        status: "error",
        message: "That session couldn’t be saved. Try again.",
      };
    }

    return { status: "saved", session };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown training save error";
    console.error("[training] Save failed:", message);
    return {
      status: "error",
      message: "That session couldn’t be saved. Try again.",
    };
  }
}
