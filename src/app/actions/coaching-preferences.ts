"use server";

import { getCurrentUser } from "@/lib/auth/session";
import {
  DEFAULT_TIME_ZONE,
  resolveTimeZone,
} from "@/lib/coaching-notifications";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type CoachingPreferences = {
  enabled: boolean;
  timeZone: string;
};

export async function getCoachingPreferences(): Promise<
  { status: "ok"; preferences: CoachingPreferences } | { status: "error"; message: string }
> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("timezone, coaching_notifications_enabled")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[coaching] Preferences failed:", error.message);
    return {
      status: "error",
      message: "Notification settings couldn’t be loaded.",
    };
  }

  return {
    status: "ok",
    preferences: {
      enabled: data?.coaching_notifications_enabled !== false,
      timeZone: resolveTimeZone(
        typeof data?.timezone === "string" ? data.timezone : DEFAULT_TIME_ZONE,
      ),
    },
  };
}

export async function updateCoachingPreferences(input: {
  enabled: boolean;
  timeZone: string;
}): Promise<{ status: "ok"; preferences: CoachingPreferences } | { status: "error"; message: string }> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const timeZone = input.timeZone.trim();
  if (resolveTimeZone(timeZone) !== timeZone) {
    return { status: "error", message: "That timezone isn’t recognised." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      coaching_notifications_enabled: input.enabled,
      timezone: timeZone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    console.error("[coaching] Preference update failed:", error.message);
    return {
      status: "error",
      message: "Notification settings couldn’t be saved.",
    };
  }

  return {
    status: "ok",
    preferences: { enabled: input.enabled, timeZone },
  };
}
