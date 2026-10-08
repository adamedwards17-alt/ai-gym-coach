import { redirect } from "next/navigation";
import { TrainingLogExperience } from "@/components/train/TrainingLogExperience";
import { LOGIN_PATH, ONBOARDING_PATH } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Train" };

export default async function TrainPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
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

  return <TrainingLogExperience />;
}
