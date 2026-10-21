import { redirect } from "next/navigation";
import { NutritionLogExperience } from "@/components/nutrition/NutritionLogExperience";
import { isLocalPreviewUser } from "@/lib/auth/local-preview";
import { LOGIN_PATH, ONBOARDING_PATH } from "@/lib/auth/paths";
import { getCurrentUser } from "@/lib/auth/session";
import { isMealTypeId, isValidLoggedDate } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Nutrition" };

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ meal?: string; date?: string; log?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  if (isLocalPreviewUser(user)) {
    const params = await searchParams;
    const initialMealType = isMealTypeId(params.meal) ? params.meal : null;
    const initialDate =
      typeof params.date === "string" && isValidLoggedDate(params.date)
        ? params.date
        : null;
    return (
      <NutritionLogExperience
        initialMealType={initialMealType}
        initialDate={initialDate}
        initialLoggingOpen={params.log === "1"}
      />
    );
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

  const params = await searchParams;
  const initialMealType = isMealTypeId(params.meal) ? params.meal : null;
  const initialDate =
    typeof params.date === "string" && isValidLoggedDate(params.date)
      ? params.date
      : null;

  return (
    <NutritionLogExperience
      initialMealType={initialMealType}
      initialDate={initialDate}
      initialLoggingOpen={params.log === "1"}
    />
  );
}
