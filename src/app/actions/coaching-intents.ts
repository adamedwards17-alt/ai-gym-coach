"use server";

import { getCurrentUser } from "@/lib/auth/session";
import {
  isCoachingIntent,
  COACHING_INTENTS,
  type CoachingIntent,
} from "@/lib/coaching-intents";
import { resolveTimeZone, zonedClock } from "@/lib/coaching-notifications";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function openCoachingIntentChat(intent: string): Promise<
  | { status: "ok"; conversationId: string; draft: string }
  | { status: "error"; message: string }
> {
  if (!isCoachingIntent(intent)) {
    return { status: "error", message: "That coaching prompt isn’t available." };
  }
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const prompt = COACHING_INTENTS[intent as CoachingIntent];
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .maybeSingle();
  const timeZone = resolveTimeZone(
    typeof profile?.timezone === "string" ? profile.timezone : null,
  );
  const today = zonedClock(new Date(), timeZone).date;

  const { data: existing, error: listError } = await supabase
    .from("coach_conversations")
    .select("id, created_at")
    .eq("user_id", user.id)
    .eq("title", prompt.title)
    .order("created_at", { ascending: false })
    .limit(5);

  if (listError) {
    console.error("[coaching] Intent lookup failed:", listError.message);
    return { status: "error", message: "The coach couldn’t be opened." };
  }

  const match = (existing ?? []).find((row) => {
    if (typeof row.created_at !== "string") {
      return false;
    }
    return zonedClock(new Date(row.created_at), timeZone).date === today;
  });

  if (match && typeof match.id === "string") {
    const { count } = await supabase
      .from("coach_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", match.id);
    return {
      status: "ok",
      conversationId: match.id,
      draft: count ? "" : prompt.draft,
    };
  }

  const { data, error } = await supabase
    .from("coach_conversations")
    .insert({ user_id: user.id, title: prompt.title })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[coaching] Intent chat failed:", error?.message ?? "No row");
    return { status: "error", message: "The coach couldn’t be opened." };
  }

  return { status: "ok", conversationId: data.id, draft: prompt.draft };
}
