/**
 * Contextual coach loading copy from the latest user message intent.
 * Deterministic and cheap — no model call.
 */

export type CoachLoadingIntent =
  | "calories"
  | "macros"
  | "training_plan"
  | "workout_review"
  | "food"
  | "terminology"
  | "recovery"
  | "general";

const INTENT_PATTERNS: Array<{ intent: CoachLoadingIntent; pattern: RegExp }> = [
  {
    intent: "terminology",
    pattern:
      /\b(what (does|is)|mean(s)?|explain|define)\b.*\b(recomp|deficit|surplus|rir|rmr|tdee|hypertrophy|progressive overload|maintenance)\b|\b(recomp|rir|tdee)\b.*\b(mean|explain)\b/i,
  },
  {
    intent: "calories",
    pattern:
      /\b(calor(ie|ies)|kcal|maintenance|deficit|surplus|energy (need|intake|target))\b/i,
  },
  {
    intent: "macros",
    pattern: /\b(macro|protein|carb(s|ohydrate)?|fat target|macros)\b/i,
  },
  {
    intent: "training_plan",
    pattern:
      /\b(programme|program|phase|training plan|schedule|workout plan|cut|bulk|hypertrophy phase)\b/i,
  },
  {
    intent: "workout_review",
    pattern:
      /\b(last workout|how did (my|the) (last )?(session|workout)|compare|progress(ion)?|sets?|reps?|rir)\b/i,
  },
  {
    intent: "food",
    pattern:
      /\b(eat|dinner|lunch|breakfast|meal|food|snack|recipe|what should i (have|eat))\b/i,
  },
  {
    intent: "recovery",
    pattern: /\b(recover|sore|sleep|rest day|fatigue|energy)\b/i,
  },
];

const LOADING_BY_INTENT: Record<CoachLoadingIntent, string> = {
  calories: "Reviewing your calorie targets…",
  macros: "Checking your macro targets…",
  training_plan: "Working through your training plan…",
  workout_review: "Checking your recent training…",
  food: "Thinking through your meal options…",
  terminology: "Putting that into plain English…",
  recovery: "Considering recovery and readiness…",
  general: "Thinking that through…",
};

export function classifyCoachLoadingIntent(
  message: string,
): CoachLoadingIntent {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "general";
  }
  for (const entry of INTENT_PATTERNS) {
    if (entry.pattern.test(cleaned)) {
      return entry.intent;
    }
  }
  return "general";
}

export function getCoachLoadingMessage(message: string): string {
  return LOADING_BY_INTENT[classifyCoachLoadingIntent(message)];
}
