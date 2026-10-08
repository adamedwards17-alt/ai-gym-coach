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
  | { status: "local"; reason: "no-session" | "not-configured" | "error" };

export async function persistOnboarding(
  draft: OnboardingDraft,
): Promise<PersistResult> {
  saveOnboardingDraft(draft);

  if (!isOnboardingComplete(draft)) {
    return { status: "local", reason: "error" };
  }

  if (!isSupabaseConfigured()) {
    return { status: "local", reason: "not-configured" };
  }

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { status: "local", reason: "no-session" };
    }

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      ...toProfileRecord(draft),
    });

    if (error) {
      return { status: "local", reason: "error" };
    }

    return { status: "supabase" };
  } catch {
    return { status: "local", reason: "error" };
  }
}
