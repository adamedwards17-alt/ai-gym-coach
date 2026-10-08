import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ONBOARDING_PATH, TODAY_PATH } from "@/lib/auth/paths";
import type { User } from "@supabase/supabase-js";

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getPostAuthPath(
  userId: string,
): Promise<typeof TODAY_PATH | typeof ONBOARDING_PATH> {
  if (!isSupabaseConfigured()) {
    return ONBOARDING_PATH;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data?.onboarding_completed_at) {
    return ONBOARDING_PATH;
  }

  return TODAY_PATH;
}

export function suggestedNameFromUser(
  user: User,
  profileName?: string | null,
): string {
  if (profileName?.trim()) {
    return profileName.trim();
  }

  const full =
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null) ??
    (typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : null) ??
    "";

  const first = full.trim().split(/\s+/)[0];
  return first ?? "";
}
