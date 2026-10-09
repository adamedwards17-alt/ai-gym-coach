import { GeminiProvider, isGeminiConfigured } from "@/lib/ai/providers/gemini";
import type {
  CoachGenerationContext,
  CoachProfileContext,
  CoachTakeResult,
  CompletedCheckIn,
} from "@/lib/ai/types";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getCoachTake } from "@/lib/today";

const PROFILE_SELECT = [
  "display_name",
  "age",
  "sex",
  "height_cm",
  "weight_kg",
  "primary_goal",
  "goal_in_own_words",
  "goal_started_at",
  "target_weight_kg",
  "target_date",
  "training_frequency",
  "training_types",
  "training_location",
  "equipment",
  "likes_dislikes",
  "activity_level",
  "typical_sleep",
  "lifestyle_constraints",
  "dietary_preferences",
  "foods_avoided",
  "allergies",
  "meals_per_day",
  "nutrition_support",
  "coaching_style",
].join(", ");

function previewFallback(checkIn: CompletedCheckIn): CoachTakeResult {
  const fallback = getCoachTake({
    feeling: checkIn.feeling,
    sleep: checkIn.sleep,
    plan: checkIn.plan,
    sleepHours: checkIn.sleepHours ?? null,
    sleepQuality: checkIn.sleepQuality ?? null,
    feelingRating: checkIn.feelingRating ?? null,
  });
  return {
    source: "preview",
    text:
      fallback?.text ??
      "Keep today sensible. Listen to your body, hit what you can with quality, and protect tonight’s sleep.",
  };
}

type ProfileRow = {
  display_name: string | null;
  age: number | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  primary_goal: string | null;
  goal_in_own_words: string | null;
  goal_started_at: string | null;
  target_weight_kg: number | null;
  target_date: string | null;
  training_frequency: string | null;
  training_types: string[] | null;
  training_location: string | null;
  equipment: string[] | null;
  likes_dislikes: string | null;
  activity_level: string | null;
  typical_sleep: string | null;
  lifestyle_constraints: string | null;
  dietary_preferences: string[] | null;
  foods_avoided: string | null;
  allergies: string | null;
  meals_per_day: number | null;
  nutrition_support: string | null;
  coaching_style: string | null;
};

function toProfileContext(row: ProfileRow): CoachProfileContext {
  return {
    display_name: row.display_name,
    age: row.age,
    sex: row.sex,
    height_cm: row.height_cm,
    weight_kg: row.weight_kg,
    primary_goal: row.primary_goal,
    goal_in_own_words: row.goal_in_own_words,
    goal_started_at: row.goal_started_at,
    days_on_current_goal: null,
    target_weight_kg:
      row.target_weight_kg != null ? Number(row.target_weight_kg) : null,
    target_date: row.target_date,
    training_frequency: row.training_frequency,
    training_types: row.training_types,
    training_location: row.training_location,
    equipment: row.equipment,
    likes_dislikes: row.likes_dislikes,
    activity_level: row.activity_level,
    typical_sleep: row.typical_sleep,
    lifestyle_constraints: row.lifestyle_constraints,
    dietary_preferences: row.dietary_preferences,
    foods_avoided: row.foods_avoided,
    allergies: row.allergies,
    meals_per_day: row.meals_per_day,
    nutrition_support: row.nutrition_support,
    coaching_style: row.coaching_style,
  };
}

/**
 * Authenticated coaching generation. Never exposes API errors to the client.
 * Falls back to the deterministic take when Gemini is unavailable.
 */
export async function generateAuthenticatedCoachTake(
  checkIn: CompletedCheckIn,
): Promise<CoachTakeResult> {
  const user = await getCurrentUser();
  if (!user) {
    console.error("[coach-take] No authenticated user");
    return previewFallback(checkIn);
  }

  if (!isGeminiConfigured()) {
    console.error("[coach-take] GEMINI_API_KEY is missing or unset");
    return previewFallback(checkIn);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[coach-take] Profile load failed:", error.message);
      return previewFallback(checkIn);
    }

    if (!data) {
      console.error("[coach-take] No profile row for authenticated user");
      return previewFallback(checkIn);
    }

    const profile = data as unknown as ProfileRow;

    const context: CoachGenerationContext = {
      profile: toProfileContext(profile),
      checkIn,
    };

    const provider = new GeminiProvider();
    const text = await provider.generateCoachTake(context);

    return { text, source: "gemini" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown coach-take error";
    console.error("[coach-take] Generation failed:", message);
    return previewFallback(checkIn);
  }
}
