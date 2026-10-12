/**
 * Detect short affirmative replies that confirm a pending coach proposal.
 * Conservative: only clear yes-style messages, not open-ended discussion.
 */

const AFFIRMATION_PATTERNS: RegExp[] = [
  /^yes\.?$/i,
  /^yep\.?$/i,
  /^yeah\.?$/i,
  /^ok\.?$/i,
  /^okay\.?$/i,
  /^sure\.?$/i,
  /^do it\.?$/i,
  /^go ahead\.?$/i,
  /^please do\.?$/i,
  /^sounds good\.?$/i,
  /^that works\.?$/i,
  /^i agree\.?$/i,
  /^agreed\.?$/i,
  /^accept(ed)?\.?$/i,
  /^confirm(ed)?\.?$/i,
  /^let'?s do (it|that)\.?$/i,
  /^yes[,.]?\s+(please|let'?s|do it|go ahead|sounds good).*$/i,
  /^ok[,.]?\s+(please|let'?s|do it|go ahead).*$/i,
  /^sure[,.]?\s+(please|let'?s|do it|go ahead).*$/i,
];

export function isCoachAffirmation(content: string): boolean {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > 80) {
    return false;
  }
  // Reject if it looks like a new question or counter-proposal.
  if (/[?]/.test(cleaned) || /\bbut\b|\binstead\b|\bexcept\b/i.test(cleaned)) {
    return false;
  }
  return AFFIRMATION_PATTERNS.some((pattern) => pattern.test(cleaned));
}
