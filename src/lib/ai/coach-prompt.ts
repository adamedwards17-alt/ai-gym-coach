import {
  labelForFeeling,
  labelForPlan,
  labelForSleep,
  labelForSleepHours,
  labelForSleepQuality,
  type FeelingRating,
  type SleepHoursOption,
  type SleepQualityId,
} from "@/lib/today";
import type { CoachGenerationContext } from "@/lib/ai/types";

export const COACH_SYSTEM_PROMPT = `You are the coach inside AI Gym Coach — a calm, intelligent personal trainer.

Write a short "Coach’s Take" insight for the Today dashboard based only on the user's profile and today's check-in.

Tone:
- intelligent, practical, concise, personalised
- encouraging and honest without being cheesy
- calm, never generic motivational filler

Format:
- 1–2 short sentences only (about 25–45 words total)
- plain text only (no markdown, no bullet lists, no headings)
- speak directly to the user; use their first name sparingly if natural
- this is a dashboard insight, not a full coaching report

Content:
- the single most useful observation for today
- optionally one practical nudge (protein, training intensity, recovery)
- if they report soreness, suggest a sensible adjustment — do not diagnose
- if they describe potentially serious symptoms (chest pain, fainting, severe shortness of breath, or serious injury symptoms), advise seeking medical attention and stop there

Do not invent profile details that are missing. Do not mention that you are an AI.`;

function formatList(values: string[] | null | undefined): string {
  if (!values || values.length === 0) {
    return "not provided";
  }
  return values.join(", ");
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "not provided";
  }
  return String(value);
}

export function buildCoachUserPrompt(context: CoachGenerationContext): string {
  const { profile, checkIn } = context;
  const sleepHours =
    checkIn.sleepHours != null
      ? labelForSleepHours(checkIn.sleepHours as SleepHoursOption)
      : "not provided";
  const sleepQuality =
    checkIn.sleepQuality != null
      ? labelForSleepQuality(checkIn.sleepQuality as SleepQualityId)
      : "not provided";
  const feelingRating =
    checkIn.feelingRating != null
      ? `${checkIn.feelingRating as FeelingRating} / 5`
      : "not provided";

  return `User profile:
- Name: ${formatValue(profile.display_name)}
- Age: ${formatValue(profile.age)}
- Sex: ${formatValue(profile.sex)}
- Height (cm): ${formatValue(profile.height_cm)}
- Weight (kg): ${formatValue(profile.weight_kg)}
- Primary goal: ${formatValue(profile.primary_goal)}
- Goal in their words: ${formatValue(profile.goal_in_own_words)}
- Goal started: ${formatValue(profile.goal_started_at)}
- Days on current goal: ${formatValue(profile.days_on_current_goal)}
- Target weight (kg): ${formatValue(profile.target_weight_kg)}
- Target date: ${formatValue(profile.target_date)}
- Training frequency: ${formatValue(profile.training_frequency)}
- Training types: ${formatList(profile.training_types)}
- Training location: ${formatValue(profile.training_location)}
- Equipment: ${formatList(profile.equipment)}
- Likes / dislikes: ${formatValue(profile.likes_dislikes)}
- Activity level: ${formatValue(profile.activity_level)}
- Typical sleep: ${formatValue(profile.typical_sleep)}
- Lifestyle constraints: ${formatValue(profile.lifestyle_constraints)}
- Dietary preferences: ${formatList(profile.dietary_preferences)}
- Foods avoided: ${formatValue(profile.foods_avoided)}
- Allergies: ${formatValue(profile.allergies)}
- Meals per day: ${formatValue(profile.meals_per_day)}
- Nutrition support preference: ${formatValue(profile.nutrition_support)}
- Preferred coaching style: ${formatValue(profile.coaching_style)}

Today's check-in:
- Sleep hours: ${sleepHours}
- Sleep quality: ${sleepQuality}
- Feeling rating: ${feelingRating}
- Feeling context: ${labelForFeeling(checkIn.feeling)}
- Sleep (legacy score): ${labelForSleep(checkIn.sleep)}
- Planned training: ${labelForPlan(checkIn.plan)}

Write today's Coach’s Take as 1–2 short sentences.`;
}
