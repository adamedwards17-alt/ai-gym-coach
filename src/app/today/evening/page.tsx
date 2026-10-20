import { redirect } from "next/navigation";
import { EveningCheckInExperience } from "@/components/today/EveningCheckInExperience";
import { isLocalPreviewUser } from "@/lib/auth/local-preview";
import { LOGIN_PATH, ONBOARDING_PATH } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Evening check-in" };

export default async function EveningCheckInPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const params = await searchParams;
  const date = typeof params.date === "string" ? params.date : null;

  if (isLocalPreviewUser(user)) {
    return <EveningCheckInExperience date={date} />;
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

  return <EveningCheckInExperience date={date} />;
}
