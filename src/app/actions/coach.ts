"use server";

import { createTrainingPlanProposal } from "@/app/actions/training";
import { buildCoachContext } from "@/lib/ai/build-coach-context";
import {
  GeminiProvider,
  isGeminiConfigured,
} from "@/lib/ai/providers/gemini";
import { getCurrentUser } from "@/lib/auth/session";
import {
  isValidCoachDate,
  parseCoachChatResponse,
  titleFallbackFromMessage,
  type CoachConversationRecord,
  type CoachMessageRecord,
} from "@/lib/coach";
import {
  MEAL_INSPIRATION_SEED_MESSAGE,
  MEAL_INSPIRATION_TITLE,
} from "@/lib/meal-inspiration";
import {
  buildSkipWorkoutSeedMessage,
  SKIP_WORKOUT_CHAT_TITLE,
} from "@/lib/skip-workout-coach";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { parsePlanProposalChanges, type SkipReasonId } from "@/lib/training-plan";
import { isValidSessionDate } from "@/lib/training";

export type ListConversationsResult =
  | { status: "ok"; conversations: CoachConversationRecord[] }
  | { status: "error"; message: string };

export type CreateConversationResult =
  | { status: "created"; conversation: CoachConversationRecord }
  | { status: "error"; message: string };

export type StartMealInspirationResult =
  | { status: "created"; conversation: CoachConversationRecord }
  | { status: "error"; message: string };

export type StartSkipWorkoutResult =
  | { status: "created"; conversation: CoachConversationRecord }
  | { status: "error"; message: string };

export type LoadConversationResult =
  | {
      status: "ok";
      conversation: CoachConversationRecord;
      messages: CoachMessageRecord[];
    }
  | { status: "not_found" }
  | { status: "error"; message: string };

export type SendCoachMessageResult =
  | {
      status: "ok";
      conversation: CoachConversationRecord;
      messages: CoachMessageRecord[];
    }
  | {
      status: "error";
      message: string;
      conversation?: CoachConversationRecord;
      messages?: CoachMessageRecord[];
    };

const CONVERSATION_SELECT = "id, title, created_at, updated_at";
const MESSAGE_SELECT = "id, conversation_id, role, content, created_at";

function toConversation(
  row: Record<string, unknown>,
): CoachConversationRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.created_at !== "string" ||
    typeof row.updated_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    title: typeof row.title === "string" ? row.title : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toMessage(row: Record<string, unknown>): CoachMessageRecord | null {
  if (
    typeof row.id !== "string" ||
    typeof row.conversation_id !== "string" ||
    (row.role !== "user" && row.role !== "assistant") ||
    typeof row.content !== "string" ||
    typeof row.created_at !== "string"
  ) {
    return null;
  }

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
  };
}

async function loadOwnedConversation(
  conversationId: string,
  userId: string,
): Promise<CoachConversationRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("[coach] Load conversation failed:", error.message);
    }
    return null;
  }

  return toConversation(data as Record<string, unknown>);
}

async function loadMessages(
  conversationId: string,
  userId: string,
): Promise<CoachMessageRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[coach] Load messages failed:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => toMessage(row as Record<string, unknown>))
    .filter((row): row is CoachMessageRecord => row !== null);
}

export async function listCoachConversations(): Promise<ListConversationsResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so conversations can’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coach_conversations")
      .select(CONVERSATION_SELECT)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) {
      console.error("[coach] List failed:", error.message);
      return {
        status: "error",
        message: "Conversations couldn’t be loaded. Try again.",
      };
    }

    const conversations = (data ?? [])
      .map((row) => toConversation(row as Record<string, unknown>))
      .filter((row): row is CoachConversationRecord => row !== null);

    return { status: "ok", conversations };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown coach list error";
    console.error("[coach] List failed:", message);
    return {
      status: "error",
      message: "Conversations couldn’t be loaded. Try again.",
    };
  }
}

export async function createCoachConversation(): Promise<CreateConversationResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so a chat couldn’t be created.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coach_conversations")
      .insert({
        user_id: user.id,
        title: null,
      })
      .select(CONVERSATION_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[coach] Create failed:",
        error?.message ?? "No row returned",
      );
      return {
        status: "error",
        message: "A new chat couldn’t be created. Try again.",
      };
    }

    const conversation = toConversation(data as Record<string, unknown>);
    if (!conversation) {
      return {
        status: "error",
        message: "A new chat couldn’t be created. Try again.",
      };
    }

    return { status: "created", conversation };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown coach create error";
    console.error("[coach] Create failed:", message);
    return {
      status: "error",
      message: "A new chat couldn’t be created. Try again.",
    };
  }
}

/**
 * Opens a dedicated meal-inspiration Coach chat with live day context.
 * Does not create any nutrition entries.
 */
export async function startMealInspirationChat(input: {
  localDate: string;
}): Promise<StartMealInspirationResult> {
  if (!isValidCoachDate(input.localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so inspiration couldn’t start.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coach_conversations")
      .insert({
        user_id: user.id,
        title: MEAL_INSPIRATION_TITLE,
      })
      .select(CONVERSATION_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[coach] Meal inspiration create failed:",
        error?.message ?? "No row returned",
      );
      return {
        status: "error",
        message: "Inspiration couldn’t start. Try again.",
      };
    }

    const conversation = toConversation(data as Record<string, unknown>);
    if (!conversation) {
      return {
        status: "error",
        message: "Inspiration couldn’t start. Try again.",
      };
    }

    const seeded = await sendCoachMessage({
      conversationId: conversation.id,
      content: MEAL_INSPIRATION_SEED_MESSAGE,
      localDate: input.localDate,
    });

    if (seeded.status === "error" && !seeded.conversation) {
      return {
        status: "error",
        message: seeded.message,
      };
    }

    return {
      status: "created",
      conversation: seeded.conversation ?? conversation,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown meal inspiration error";
    console.error("[coach] Meal inspiration failed:", message);
    return {
      status: "error",
      message: "Inspiration couldn’t start. Try again.",
    };
  }
}

/**
 * Opens a Coach chat after the user skips a planned workout.
 * Plan is already marked skipped; Coach must not change it until confirmed.
 */
export async function startSkipWorkoutCoachChat(input: {
  localDate: string;
  planEntryId: string;
  title: string;
  planDate: string;
  reason: SkipReasonId;
  notes?: string | null;
}): Promise<StartSkipWorkoutResult> {
  if (!isValidCoachDate(input.localDate) || !isValidSessionDate(input.planDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so coaching couldn’t start.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("coach_conversations")
      .insert({
        user_id: user.id,
        title: SKIP_WORKOUT_CHAT_TITLE,
      })
      .select(CONVERSATION_SELECT)
      .single();

    if (error || !data) {
      console.error(
        "[coach] Skip workout chat create failed:",
        error?.message ?? "No row",
      );
      return {
        status: "error",
        message: "Coaching couldn’t start. Try again.",
      };
    }

    const conversation = toConversation(data as Record<string, unknown>);
    if (!conversation) {
      return {
        status: "error",
        message: "Coaching couldn’t start. Try again.",
      };
    }

    const seeded = await sendCoachMessage({
      conversationId: conversation.id,
      content: buildSkipWorkoutSeedMessage({
        title: input.title,
        planDate: input.planDate,
        reason: input.reason,
        notes: input.notes,
      }),
      localDate: input.localDate,
    });

    if (seeded.status === "error" && !seeded.conversation) {
      return { status: "error", message: seeded.message };
    }

    return {
      status: "created",
      conversation: seeded.conversation ?? conversation,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown skip coach error";
    console.error("[coach] Skip workout chat failed:", message);
    return {
      status: "error",
      message: "Coaching couldn’t start. Try again.",
    };
  }
}

export async function loadCoachConversation(
  conversationId: string,
): Promise<LoadConversationResult> {
  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so this chat couldn’t be loaded.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const conversation = await loadOwnedConversation(conversationId, user.id);
    if (!conversation) {
      return { status: "not_found" };
    }

    const messages = await loadMessages(conversationId, user.id);
    return { status: "ok", conversation, messages };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown coach load error";
    console.error("[coach] Load failed:", message);
    return {
      status: "error",
      message: "This chat couldn’t be loaded. Try again.",
    };
  }
}

async function generateAndPersistReply(input: {
  userId: string;
  conversationId: string;
  localDate: string;
  firstUserContentForTitle: string | null;
}): Promise<SendCoachMessageResult> {
  const conversation = await loadOwnedConversation(
    input.conversationId,
    input.userId,
  );
  if (!conversation) {
    return { status: "error", message: "That chat couldn’t be found." };
  }

  const messages = await loadMessages(input.conversationId, input.userId);

  if (!isGeminiConfigured()) {
    return {
      status: "error",
      message:
        "The coach isn’t connected right now. Check GEMINI_API_KEY and try again.",
      conversation,
      messages,
    };
  }

  try {
    const context = await buildCoachContext({
      userId: input.userId,
      conversationId: input.conversationId,
      localDate: input.localDate,
    });

    const provider = new GeminiProvider();
    const { rawText } = await provider.generateCoachChat(context);
    const parsed = parseCoachChatResponse(rawText, input.localDate);

    if (!parsed.reply.trim()) {
      return {
        status: "error",
        message: "The coach couldn’t reply just then. Try again.",
        conversation,
        messages,
      };
    }

    const supabase = await createClient();
    const { data: assistantRow, error: assistantError } = await supabase
      .from("coach_messages")
      .insert({
        conversation_id: input.conversationId,
        user_id: input.userId,
        role: "assistant",
        content: parsed.reply,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (assistantError || !assistantRow) {
      console.error(
        "[coach] Assistant save failed:",
        assistantError?.message ?? "No row",
      );
      return {
        status: "error",
        message: "The coach replied, but it couldn’t be saved. Try again.",
        conversation,
        messages,
      };
    }

    if (parsed.events.length > 0) {
      const eventRows = parsed.events.map((event) => ({
        user_id: input.userId,
        event_date: event.event_date,
        event_type: event.event_type,
        summary: event.summary,
        source_conversation_id: input.conversationId,
        active: true,
      }));

      const { error: eventsError } = await supabase
        .from("coach_events")
        .insert(eventRows);

      if (eventsError) {
        console.error("[coach] Events save failed:", eventsError.message);
      }
    }

    if (parsed.planProposal) {
      const changes = parsePlanProposalChanges(parsed.planProposal.changes);
      if (changes.length > 0) {
        const proposalResult = await createTrainingPlanProposal({
          conversationId: input.conversationId,
          reason: parsed.planProposal.reason,
          changes,
          idempotencyKey: `msg:${assistantRow.id}`,
        });
        if (proposalResult.status === "error") {
          console.error(
            "[coach] Plan proposal save failed:",
            proposalResult.message,
          );
        }
      }
    }

    let nextConversation = conversation;
    if (!conversation.title) {
      const title =
        parsed.title ??
        (input.firstUserContentForTitle
          ? titleFallbackFromMessage(input.firstUserContentForTitle)
          : "New chat");

      const { data: updated, error: titleError } = await supabase
        .from("coach_conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("user_id", input.userId)
        .select(CONVERSATION_SELECT)
        .single();

      if (titleError) {
        console.error("[coach] Title update failed:", titleError.message);
        await supabase
          .from("coach_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", input.conversationId)
          .eq("user_id", input.userId);
      } else if (updated) {
        nextConversation =
          toConversation(updated as Record<string, unknown>) ?? conversation;
      }
    } else {
      await supabase
        .from("coach_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", input.conversationId)
        .eq("user_id", input.userId);

      const refreshed = await loadOwnedConversation(
        input.conversationId,
        input.userId,
      );
      if (refreshed) {
        nextConversation = refreshed;
      }
    }

    const nextMessages = await loadMessages(input.conversationId, input.userId);
    const assistant = toMessage(assistantRow as Record<string, unknown>);
    if (assistant && !nextMessages.some((m) => m.id === assistant.id)) {
      nextMessages.push(assistant);
    }

    return {
      status: "ok",
      conversation: nextConversation,
      messages: nextMessages,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown coach reply error";
    console.error("[coach] Reply failed:", message);
    return {
      status: "error",
      message: "The coach couldn’t reply just then. Try again.",
      conversation,
      messages,
    };
  }
}

export async function sendCoachMessage(input: {
  conversationId: string;
  content: string;
  localDate: string;
}): Promise<SendCoachMessageResult> {
  if (!isValidCoachDate(input.localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const content = input.content.trim();
  if (!content) {
    return { status: "error", message: "Write a message for your coach." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the message couldn’t be sent.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const conversation = await loadOwnedConversation(
    input.conversationId,
    user.id,
  );
  if (!conversation) {
    return { status: "error", message: "That chat couldn’t be found." };
  }

  try {
    const supabase = await createClient();
    const { error: insertError } = await supabase.from("coach_messages").insert({
      conversation_id: input.conversationId,
      user_id: user.id,
      role: "user",
      content,
    });

    if (insertError) {
      console.error("[coach] User message save failed:", insertError.message);
      return {
        status: "error",
        message: "Your message couldn’t be saved. Try again.",
      };
    }

    await supabase
      .from("coach_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", input.conversationId)
      .eq("user_id", user.id);

    return generateAndPersistReply({
      userId: user.id,
      conversationId: input.conversationId,
      localDate: input.localDate,
      firstUserContentForTitle: conversation.title ? null : content,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown coach send error";
    console.error("[coach] Send failed:", message);
    return {
      status: "error",
      message: "Your message couldn’t be sent. Try again.",
    };
  }
}

/** Retry Gemini after a failed reply when the last message is already from the user. */
export async function retryCoachReply(input: {
  conversationId: string;
  localDate: string;
}): Promise<SendCoachMessageResult> {
  if (!isValidCoachDate(input.localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "error",
      message: "Supabase isn’t connected, so the coach can’t reply.",
    };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  const conversation = await loadOwnedConversation(
    input.conversationId,
    user.id,
  );
  if (!conversation) {
    return { status: "error", message: "That chat couldn’t be found." };
  }

  const messages = await loadMessages(input.conversationId, user.id);
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return {
      status: "error",
      message: "There’s nothing to retry.",
      conversation,
      messages,
    };
  }

  return generateAndPersistReply({
    userId: user.id,
    conversationId: input.conversationId,
    localDate: input.localDate,
    firstUserContentForTitle: conversation.title ? null : last.content,
  });
}
