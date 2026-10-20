export type CoachRecommendationItem = {
  title: string;
  detail: string;
};

export type CoachRecommendationList = {
  lead: string;
  items: CoachRecommendationItem[];
  closing: string;
};

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;

/** Split a coach reply that contains a short bullet list into cards. */
export function splitCoachRecommendations(
  content: string,
): CoachRecommendationList | null {
  const lead: string[] = [];
  const items: CoachRecommendationItem[] = [];
  const closing: string[] = [];
  let seenList = false;

  for (const line of content.split("\n")) {
    const match = line.match(BULLET);
    if (match) {
      seenList = true;
      const text = match[1].trim();
      const parts = text.split(/\s+[—–]\s+|\s+-\s+/);
      items.push({
        title: parts[0]?.trim() || text,
        detail: parts.slice(1).join(" — ").trim(),
      });
      continue;
    }
    if (!seenList) {
      lead.push(line);
    } else if (line.trim()) {
      closing.push(line);
    }
  }

  if (items.length < 2) {
    return null;
  }

  return {
    lead: lead.join("\n").trim(),
    items,
    closing: closing.join("\n").trim(),
  };
}
