import { redirect } from "next/navigation";
import { OnboardingExperience } from "@/components/onboarding/OnboardingExperience";
import { LOGIN_PATH, TODAY_PATH } from "@/lib/auth/paths";
import {
  getCurrentUser,
  suggestedNameFromUser,
} from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Onboarding" };

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.onboarding_completed_at) {
    redirect(TODAY_PATH);
  }

  return (
    <OnboardingExperience
      suggestedName={suggestedNameFromUser(user, profile?.display_name)}
    />
  );
}
