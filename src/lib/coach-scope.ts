/**
 * Lightweight scope classification for Coach.
 * Primary enforcement remains in the system prompt; this helps tests and
 * optional server-side soft redirects without replacing the model.
 */

export type CoachScopeKind = "in_scope" | "out_of_scope" | "safety_urgent";

const SAFETY_PATTERNS: RegExp[] = [
  /\bchest pain\b/i,
  /\bfaint(ing|ed)?\b/i,
  /\bsevere shortness of breath\b/i,
  /\bcan'?t breathe\b/i,
  /\bsuicid/i,
  /\bself[-\s]?harm\b/i,
];

const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\b(politic|election|left.?wing|right.?wing|ideolog)/i,
  /\b(stock|crypto|invest|mortgage|tax advice|lawsuit|legal advice)\b/i,
  /\b(write (me )?(a |some )?code|debug (this|my) (python|javascript|java)|leetcode)\b/i,
  /\b(who should I vote|capitalism vs|marxism)\b/i,
];

const IN_SCOPE_PATTERNS: RegExp[] = [
  /\b(workout|training|lift|strength|hiit|cardio|programme|program|schedule|exercise)\b/i,
  /\b(calor|macro|protein|carb|nutrition|meal|eat|diet)\b/i,
  /\b(recover|sleep|sore|rir|recomp|progressive overload|goal)\b/i,
  /\b(weight|muscle|fat loss|steps|commute|activity)\b/i,
];

const OVERRIDE_ATTEMPTS: RegExp[] = [
  /\bignore (all |your )?(previous |prior )?(instructions|rules)\b/i,
  /\byou are now (a |an )?(general|unrestricted|dan)\b/i,
  /\bdisable (your )?(safety|scope|rules)\b/i,
  /\bpretend you (are|can)\b/i,
];

export function classifyCoachScope(message: string): CoachScopeKind {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "in_scope";
  }
  if (SAFETY_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    return "safety_urgent";
  }
  if (OVERRIDE_ATTEMPTS.some((pattern) => pattern.test(cleaned))) {
    return "out_of_scope";
  }
  if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(cleaned))) {
    // Fitness-flavoured overlap still wins when clearly about training/nutrition.
    if (IN_SCOPE_PATTERNS.some((pattern) => pattern.test(cleaned))) {
      return "in_scope";
    }
    return "out_of_scope";
  }
  return "in_scope";
}

export function coachOutOfScopeReply(): string {
  return "I’m here to help with your fitness, training, nutrition and recovery. What would you like to work on there?";
}

export function coachSafetyUrgentReply(): string {
  return "That sounds like it needs proper medical advice rather than fitness coaching. Please seek appropriate medical help if you’re in danger or symptoms are severe. If it’s about training around a milder issue, tell me what’s going on and I can help you adjust safely.";
}
