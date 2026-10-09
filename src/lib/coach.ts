export type CoachMessageRole = "user" | "assistant";

export type CoachEventType =
  | "training_skipped"
  | "training_note"
  | "soreness"
  | "recovery_day"
  | "sleep_note"
  | "plan_change"
  | "nutrition_decision"
  | "goal_note"
  | "upcoming_event"
  | "lifestyle_note"
  | "other";

export type CoachConversationRecord = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type CoachMessageRecord = {
  id: string;
  conversation_id: string;
  role: CoachMessageRole;
  content: string;
  created_at: string;
};

export type CoachEventRecord = {
  id: string;
  event_date: string;
  event_type: CoachEventType;
  summary: string;
  source_conversation_id: string | null;
  active: boolean;
  created_at: string;
};

export type ParsedCoachEvent = {
  event_type: CoachEventType;
  summary: string;
  event_date: string;
};

export type ParsedPlanProposal = {
  reason: string | null;
  changes: Array<Record<string, unknown>>;
};

export type ParsedCoachChatResponse = {
  reply: string;
  title: string | null;
  events: ParsedCoachEvent[];
  planProposal: ParsedPlanProposal | null;
  structured: boolean;
};

const EVENT_TYPES: readonly CoachEventType[] = [
  "training_skipped",
  "training_note",
  "soreness",
  "recovery_day",
  "sleep_note",
  "plan_change",
  "nutrition_decision",
  "goal_note",
  "upcoming_event",
  "lifestyle_note",
  "other",
] as const;

export function getLocalCoachDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isValidCoachDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function shiftCoachDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function isCoachEventType(value: unknown): value is CoachEventType {
  return (
    typeof value === "string" &&
    (EVENT_TYPES as readonly string[]).includes(value)
  );
}

export function isCoachMessageRole(value: unknown): value is CoachMessageRole {
  return value === "user" || value === "assistant";
}

export function titleFallbackFromMessage(content: string): string {
  const cleaned = content.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "New chat";
  }
  if (cleaned.length <= 40) {
    return cleaned;
  }
  return `${cleaned.slice(0, 37).trimEnd()}…`;
}

export function normalizeTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
  if (!cleaned) {
    return null;
  }
  return cleaned.length > 60 ? `${cleaned.slice(0, 57).trimEnd()}…` : cleaned;
}

function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as unknown;
    } catch {
      // continue
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }

  return null;
}

export function parseCoachChatResponse(
  raw: string,
  localDate: string,
): ParsedCoachChatResponse {
  const parsed = extractJsonObject(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const reply = raw.trim();
    return {
      reply,
      title: null,
      events: [],
      planProposal: null,
      structured: false,
    };
  }

  const record = parsed as Record<string, unknown>;
  const reply =
    typeof record.reply === "string" && record.reply.trim().length > 0
      ? record.reply.trim()
      : raw.trim();

  const title = normalizeTitle(record.title);

  const events: ParsedCoachEvent[] = [];
  if (Array.isArray(record.events)) {
    for (const item of record.events) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const event = item as Record<string, unknown>;
      if (!isCoachEventType(event.event_type)) {
        continue;
      }
      if (typeof event.summary !== "string" || !event.summary.trim()) {
        continue;
      }
      const eventDate =
        typeof event.event_date === "string" &&
        isValidCoachDate(event.event_date)
          ? event.event_date
          : localDate;
      events.push({
        event_type: event.event_type,
        summary: event.summary.trim().slice(0, 280),
        event_date: eventDate,
      });
    }
  }

  let planProposal: ParsedPlanProposal | null = null;
  const proposalRaw = record.plan_proposal ?? record.planProposal;
  if (proposalRaw && typeof proposalRaw === "object" && !Array.isArray(proposalRaw)) {
    const proposal = proposalRaw as Record<string, unknown>;
    const changes = Array.isArray(proposal.changes) ? proposal.changes : [];
    const normalizedChanges = changes
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item),
      )
      .slice(0, 12);
    if (normalizedChanges.length > 0) {
      planProposal = {
        reason:
          typeof proposal.reason === "string" && proposal.reason.trim()
            ? proposal.reason.trim().slice(0, 400)
            : null,
        changes: normalizedChanges,
      };
    }
  }

  return {
    reply,
    title,
    events: events.slice(0, 3),
    planProposal,
    structured: true,
  };
}

export function truncateMessagesForModel<
  T extends { role: CoachMessageRole; content: string },
>(messages: T[], maxMessages = 30, maxChars = 12000): T[] {
  const recent = messages.slice(-maxMessages);
  let total = 0;
  const kept: T[] = [];

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const nextLen = recent[i].content.length;
    if (kept.length > 0 && total + nextLen > maxChars) {
      break;
    }
    kept.push(recent[i]);
    total += nextLen;
  }

  return kept.reverse();
}
