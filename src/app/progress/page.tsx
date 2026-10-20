import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProgressExperience } from "@/components/progress/ProgressExperience";
import { isLocalPreviewUser } from "@/lib/auth/local-preview";
import { LOGIN_PATH, ONBOARDING_PATH } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Progress" };

export default async function ProgressPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (isLocalPreviewUser(user)) {
    return <ProgressExperience />;
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.onboarding_completed_at) {
    redirect(ONBOARDING_PATH);
  }

  return <ProgressExperience />;
}
