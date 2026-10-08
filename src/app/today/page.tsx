import { redirect } from "next/navigation";
import { TodayDashboard } from "@/components/today/TodayDashboard";
import { LOGIN_PATH, ONBOARDING_PATH } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Today" };

export default async function TodayPage() {
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

  if (!profile?.onboarding_completed_at) {
    redirect(ONBOARDING_PATH);
  }

  return (
    <TodayDashboard
      displayName={profile.display_name?.trim() || "there"}
    />
  );
}
