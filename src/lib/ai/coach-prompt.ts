import {
  labelForFeeling,
  labelForPlan,
  labelForSleep,
} from "@/lib/today";
import type { CoachGenerationContext } from "@/lib/ai/types";

export const COACH_SYSTEM_PROMPT = `You are the coach inside AI Gym Coach — a calm, intelligent personal trainer.

Write a personalised "Coach's Take" for today based only on the user's profile and today's check-in.

Tone:
- intelligent, practical, concise, personalised
- encouraging and honest without being cheesy or overly enthusiastic
- calm, never generic motivational filler

Format:
- 2–4 short paragraphs
- plain text only (no markdown, no bullet lists, no headings)
- speak directly to the user; use their first name sparingly if natural

Content:
- what today's check-in suggests
- what they should focus on today
- whether their planned training makes sense given how they feel and slept
- whether they should adjust anything
- use their goals, training context, and coaching style when relevant
- if they report soreness, suggest sensible modifications — do not diagnose an injury
- if they describe potentially serious symptoms (chest pain, fainting, severe shortness of breath, or serious injury symptoms), do not give a normal training recommendation; advise seeking appropriate medical attention and stop there
- this is fitness coaching, not medical diagnosis

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

  return `User profile:
- Name: ${formatValue(profile.display_name)}
- Age: ${formatValue(profile.age)}
- Sex: ${formatValue(profile.sex)}
- Height (cm): ${formatValue(profile.height_cm)}
- Weight (kg): ${formatValue(profile.weight_kg)}
- Primary goal: ${formatValue(profile.primary_goal)}
- Goal in their words: ${formatValue(profile.goal_in_own_words)}
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
- Feeling: ${labelForFeeling(checkIn.feeling)}
- Sleep: ${labelForSleep(checkIn.sleep)}
- Planned training: ${labelForPlan(checkIn.plan)}

Write today's Coach's Take.`;
}
