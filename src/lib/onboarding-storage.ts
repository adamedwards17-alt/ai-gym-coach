import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isOnboardingComplete,
  toProfileRecord,
  type OnboardingDraft,
} from "@/lib/onboarding";

const DRAFT_KEY = "ai-gym-coach.onboarding.v1";

export function loadOnboardingDraft(): OnboardingDraft {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : {};
  } catch {
    return {};
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft) {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export type PersistResult =
  | { status: "supabase" }
  | {
      status: "local";
      reason: "no-session" | "not-configured" | "error";
      message: string;
    };

export async function persistOnboarding(
  draft: OnboardingDraft,
): Promise<PersistResult> {
  saveOnboardingDraft(draft);

  if (!isOnboardingComplete(draft)) {
    return {
      status: "local",
      reason: "error",
      message: "A few answers are still missing.",
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "local",
      reason: "not-configured",
      message: "Your profile couldn’t be saved because Supabase isn’t connected.",
    };
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        status: "local",
        reason: "no-session",
        message: "You’re not signed in. Sign in with Google, then save again.",
      };
    }

    const profile = toProfileRecord(draft);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      ...profile,
    });

    if (error) {
      return {
        status: "local",
        reason: "error",
        message:
          "Your profile couldn’t be saved. Check you’re signed in and try again.",
      };
    }

    // Seed canonical weight history when onboarding completes.
    if (profile.weight_kg != null) {
      const { count } = await supabase
        .from("weight_measurements")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (!count) {
        await supabase.from("weight_measurements").insert({
          user_id: user.id,
          measured_on: profile.goal_started_at,
          weight_kg: profile.weight_kg,
          source: "onboarding",
        });
      }
    }

    const { count: goalCount } = await supabase
      .from("goal_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (!goalCount) {
      await supabase.from("goal_history").insert({
        user_id: user.id,
        primary_goal: profile.primary_goal,
        goal_in_own_words: profile.goal_in_own_words,
        effective_from: profile.goal_started_at,
        source: "onboarding",
      });
    }

    return { status: "supabase" };
  } catch {
    return {
      status: "local",
      reason: "error",
      message:
        "Your profile couldn’t be saved. Check you’re signed in and try again.",
    };
  }
}
