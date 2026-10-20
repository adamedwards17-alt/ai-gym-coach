export const COACHING_INTENTS = {
  protein: {
    title: "Protein check-in",
    draft: "Here's what I've eaten so far today: ",
  },
  evening: {
    title: "Evening check-in",
    draft: "Today went ",
  },
} as const;

export type CoachingIntent = keyof typeof COACHING_INTENTS;

export function isCoachingIntent(value: string): value is CoachingIntent {
  return value === "protein" || value === "evening";
}
