"use server";

import {
  acceptPendingCoachChangesForConversation,
  createCoachChangeProposal,
} from "@/app/actions/coach-changes";
import {
  acceptTrainingPlanProposal,
  createTrainingPlanProposal,
  listPendingTrainingProposals,
} from "@/app/actions/training";
import { buildCoachContext } from "@/lib/ai/build-coach-context";
import {
  GeminiProvider,
  isGeminiConfigured,
} from "@/lib/ai/providers/gemini";
import { getCurrentUser, isLocalPreviewActive } from "@/lib/auth/session";
import {
  previewConversation,
  previewConversations,
} from "@/lib/local-preview-data";
import { isCoachAffirmation } from "@/lib/coach-affirmation";
import type { CoachChatContext } from "@/lib/ai/types";
import {
  isValidCoachDate,
  parseCoachChatResponse,
  titleFallbackFromMessage,
  type CoachConversationRecord,
  type CoachMessageRecord,
} from "@/lib/coach";
import {
  COACH_ATTACHMENT_BUCKET,
  coachImageOnlyContent,
  isOwnedCoachAttachmentPath,
  validateCoachAudioAttachment,
} from "@/lib/coach-attachments";
import { parseCommutePattern } from "@/lib/activity-pattern";
import {
  classifyCoachScope,
  coachOutOfScopeReply,
  coachSafetyUrgentReply,
} from "@/lib/coach-scope";
import { buildGoalChangeCompanions } from "@/lib/ensure-goal-change-companions";
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
const MESSAGE_SELECT =
  "id, conversation_id, role, content, created_at, attachment_path, attachment_mime_type, attachment_kind";

/** Max recent images to send to the model (cost / token safety). */
const MAX_INLINE_IMAGES_FOR_MODEL = 3;

export type TranscribeCoachAudioResult =
  | { status: "ok"; transcript: string }
  | { status: "error"; message: string };

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

  const attachmentKind =
    row.attachment_kind === "image" ? ("image" as const) : null;
  const attachmentPath =
    typeof row.attachment_path === "string" && row.attachment_path.length > 0
      ? row.attachment_path
      : null;
  const attachmentMimeType =
    typeof row.attachment_mime_type === "string"
      ? row.attachment_mime_type
      : null;

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    created_at: row.created_at,
    attachment_path: attachmentKind ? attachmentPath : null,
    attachment_mime_type: attachmentKind ? attachmentMimeType : null,
    attachment_kind: attachmentKind,
    attachment_url: null,
  };
}

async function withSignedAttachmentUrls(
  messages: CoachMessageRecord[],
): Promise<CoachMessageRecord[]> {
  const supabase = await createClient();
  return Promise.all(
    messages.map(async (message) => {
      if (!message.attachment_path || message.attachment_kind !== "image") {
        return message;
      }
      const { data, error } = await supabase.storage
        .from(COACH_ATTACHMENT_BUCKET)
        .createSignedUrl(message.attachment_path, 60 * 60);
      if (error || !data?.signedUrl) {
        console.error(
          "[coach] Signed URL failed:",
          error?.message ?? "No URL",
        );
        return message;
      }
      return { ...message, attachment_url: data.signedUrl };
    }),
  );
}

async function hydrateCoachChatImages(
  context: CoachChatContext,
  userId: string,
): Promise<CoachChatContext> {
  const supabase = await createClient();
  const messages = [...context.conversation.messages];
  let remaining = MAX_INLINE_IMAGES_FOR_MODEL;

  // Prefer newest images first so the latest menu photo is always included.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]!;
    if (!message.attachmentPath || remaining <= 0) {
      continue;
    }
    if (!message.attachmentPath.startsWith(`${userId}/`)) {
      continue;
    }
    const { data, error } = await supabase.storage
      .from(COACH_ATTACHMENT_BUCKET)
      .download(message.attachmentPath);
    if (error || !data) {
      console.error(
        "[coach] Attachment download failed:",
        error?.message ?? "No data",
      );
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    messages[i] = {
      ...message,
      imageInline: {
        mimeType: message.attachmentMimeType || "image/jpeg",
        data: buffer.toString("base64"),
      },
    };
    remaining -= 1;
  }

  return {
    ...context,
    conversation: {
      ...context.conversation,
      messages,
    },
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

  const messages = (data ?? [])
    .map((row) => toMessage(row as Record<string, unknown>))
    .filter((row): row is CoachMessageRecord => row !== null);

  return withSignedAttachmentUrls(messages);
}

export async function listCoachConversations(): Promise<ListConversationsResult> {
  if (await isLocalPreviewActive()) {
    return { status: "ok", conversations: previewConversations() };
  }
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
  if (await isLocalPreviewActive()) {
    const conversation = previewConversations()[0];
    if (!conversation) {
      return { status: "error", message: "Preview chat couldn’t be opened." };
    }
    return { status: "created", conversation };
  }
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
  if (await isLocalPreviewActive()) {
    const preview = previewConversation(conversationId);
    if (!preview) {
      return { status: "not_found" };
    }
    return { status: "ok", ...preview };
  }
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
    const rawContext = await buildCoachContext({
      userId: input.userId,
      conversationId: input.conversationId,
      localDate: input.localDate,
    });
    const context = await hydrateCoachChatImages(rawContext, input.userId);

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
          idempotencyKey: `msg:${assistantRow.id}:plan`,
        });
        if (proposalResult.status === "error") {
          console.error(
            "[coach] Plan proposal save failed:",
            proposalResult.message,
          );
        }
      }
    }

    if (parsed.weeklyScheduleProposal) {
      const weeklyResult = await createCoachChangeProposal({
        conversationId: input.conversationId,
        kind: "weekly_schedule",
        reason: parsed.weeklyScheduleProposal.reason,
        payload: parsed.weeklyScheduleProposal.payload,
        idempotencyKey: `msg:${assistantRow.id}:weekly-schedule`,
      });
      if (weeklyResult.status === "error") {
        console.error(
          "[coach] Weekly schedule proposal save failed:",
          weeklyResult.message,
        );
      }
    }

    if (parsed.nutritionProposal) {
      const nutritionResult = await createCoachChangeProposal({
        conversationId: input.conversationId,
        kind: "nutrition_targets",
        reason: parsed.nutritionProposal.reason,
        payload: parsed.nutritionProposal.payload,
        idempotencyKey: `msg:${assistantRow.id}:nutrition`,
      });
      if (nutritionResult.status === "error") {
        console.error(
          "[coach] Nutrition proposal save failed:",
          nutritionResult.message,
        );
      }
    }

    if (parsed.programmeProposal) {
      const programmeResult = await createCoachChangeProposal({
        conversationId: input.conversationId,
        kind: "programme_phases",
        reason: parsed.programmeProposal.reason,
        payload: parsed.programmeProposal.payload,
        idempotencyKey: `msg:${assistantRow.id}:programme`,
      });
      if (programmeResult.status === "error") {
        console.error(
          "[coach] Programme proposal save failed:",
          programmeResult.message,
        );
      }
    }

    if (parsed.activityProposal) {
      const activityResult = await createCoachChangeProposal({
        conversationId: input.conversationId,
        kind: "activity_pattern",
        reason: parsed.activityProposal.reason,
        payload: parsed.activityProposal.payload,
        idempotencyKey: `msg:${assistantRow.id}:activity`,
      });
      if (activityResult.status === "error") {
        console.error(
          "[coach] Activity proposal save failed:",
          activityResult.message,
        );
      }
    }

    if (parsed.goalProposal) {
      const goalResult = await createCoachChangeProposal({
        conversationId: input.conversationId,
        kind: "goal",
        reason: parsed.goalProposal.reason,
        payload: parsed.goalProposal.payload,
        idempotencyKey: `msg:${assistantRow.id}:goal`,
      });
      if (goalResult.status === "error") {
        console.error(
          "[coach] Goal proposal save failed:",
          goalResult.message,
        );
      } else {
        // Coordinated review: a goal change must assess nutrition even if the
        // model only proposed training/goal updates.
        const [{ data: profileRow }, { data: targetsRow }, { data: phaseRows }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(
                "primary_goal, age, sex, height_cm, weight_kg, activity_level, training_frequency, cycle_commute_days_per_week, cycle_commute_minutes, commute_pattern, target_date",
              )
              .eq("id", input.userId)
              .maybeSingle(),
            supabase
              .from("nutrition_targets")
              .select(
                "daily_calories, protein_g, carbs_g, fat_g, is_manual",
              )
              .eq("user_id", input.userId)
              .maybeSingle(),
            supabase
              .from("training_phases")
              .select("name, kind, status, duration_weeks")
              .eq("user_id", input.userId)
              .in("status", ["active", "upcoming"])
              .order("sort_order", { ascending: true })
              .limit(6),
          ]);

        const companions = buildGoalChangeCompanions({
          currentGoal:
            typeof profileRow?.primary_goal === "string"
              ? profileRow.primary_goal
              : null,
          proposedGoalPayload: parsed.goalProposal.payload,
          todayIso: input.localDate,
          profile: {
            age: typeof profileRow?.age === "number" ? profileRow.age : null,
            sex: typeof profileRow?.sex === "string" ? profileRow.sex : null,
            height_cm:
              typeof profileRow?.height_cm === "number"
                ? Number(profileRow.height_cm)
                : null,
            weight_kg:
              typeof profileRow?.weight_kg === "number"
                ? Number(profileRow.weight_kg)
                : null,
            primary_goal:
              typeof profileRow?.primary_goal === "string"
                ? profileRow.primary_goal
                : null,
            activity_level:
              typeof profileRow?.activity_level === "string"
                ? profileRow.activity_level
                : null,
            training_frequency:
              typeof profileRow?.training_frequency === "string"
                ? profileRow.training_frequency
                : null,
            cycle_commute_days_per_week:
              typeof profileRow?.cycle_commute_days_per_week === "number"
                ? profileRow.cycle_commute_days_per_week
                : null,
            cycle_commute_minutes:
              typeof profileRow?.cycle_commute_minutes === "number"
                ? profileRow.cycle_commute_minutes
                : null,
            commute_pattern: parseCommutePattern(profileRow?.commute_pattern),
          },
          currentTargets: targetsRow
            ? {
                dailyCalories: Number(targetsRow.daily_calories),
                proteinG: Number(targetsRow.protein_g),
                carbsG: Number(targetsRow.carbs_g),
                fatG: Number(targetsRow.fat_g),
                isManual: targetsRow.is_manual === true,
              }
            : null,
          phases: (phaseRows ?? []).map((row) => {
            const r = row as Record<string, unknown>;
            return {
              name: typeof r.name === "string" ? r.name : null,
              kind: typeof r.kind === "string" ? r.kind : null,
              status: typeof r.status === "string" ? r.status : null,
              durationWeeks:
                typeof r.duration_weeks === "number" ? r.duration_weeks : 0,
            };
          }),
          nutritionProposalAlreadyPresent: !!parsed.nutritionProposal,
        });

        if (companions.nutritionCompanion) {
          const nutritionCompanionResult = await createCoachChangeProposal({
            conversationId: input.conversationId,
            kind: "nutrition_targets",
            reason: companions.nutritionCompanion.reason,
            payload: companions.nutritionCompanion.payload,
            idempotencyKey: `msg:${assistantRow.id}:nutrition-companion`,
          });
          if (nutritionCompanionResult.status === "error") {
            console.error(
              "[coach] Nutrition companion proposal failed:",
              nutritionCompanionResult.message,
            );
          }
        }

        if (companions.review) {
          const summary = [
            "Goal-change plan review:",
            ...companions.review.summaryLines,
            companions.keepNutritionNote
              ? `Nutrition kept: ${companions.keepNutritionNote}`
              : companions.nutritionCompanion
                ? "Nutrition change proposed for confirmation."
                : null,
            `Training: ${companions.review.training.reason}`,
          ]
            .filter((line): line is string => !!line)
            .join(" ")
            .slice(0, 280);

          await supabase.from("coach_events").insert({
            user_id: input.userId,
            event_date: input.localDate,
            event_type: "goal_note",
            summary,
            source_conversation_id: input.conversationId,
            active: true,
          });
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
  /**
   * Preferred: path already uploaded by the client to private Storage
   * (`{userId}/{conversationId}/…`). Avoids Server Action body-size crashes.
   */
  attachmentPath?: string | null;
  attachmentMimeType?: string | null;
}): Promise<SendCoachMessageResult> {
  if (!isValidCoachDate(input.localDate)) {
    return { status: "error", message: "That date isn’t valid." };
  }

  const attachmentPath =
    typeof input.attachmentPath === "string" && input.attachmentPath.trim()
      ? input.attachmentPath.trim()
      : null;
  const hasImage = attachmentPath != null;
  let content = input.content.trim();
  if (!content && !hasImage) {
    return { status: "error", message: "Write a message for your coach." };
  }
  if (!content && hasImage) {
    content = coachImageOnlyContent();
  }

  if (await isLocalPreviewActive()) {
    const preview = previewConversation(input.conversationId);
    if (!preview) {
      return { status: "error", message: "That preview chat isn’t available." };
    }
    const now = new Date().toISOString();
    return {
      status: "ok",
      conversation: { ...preview.conversation, updated_at: now },
      messages: [
        ...preview.messages,
        {
          id: `preview-user-${now}`,
          conversation_id: preview.conversation.id,
          role: "user",
          content,
          created_at: now,
          attachment_path: null,
          attachment_mime_type: null,
          attachment_kind: null,
          attachment_url: null,
        },
        {
          id: `preview-coach-${now}`,
          conversation_id: preview.conversation.id,
          role: "assistant",
          content:
            "This is the local preview, so nothing is saved and the coach model isn’t called. The conversation layout is the one to review.",
          created_at: now,
          attachment_path: null,
          attachment_mime_type: null,
          attachment_kind: null,
          attachment_url: null,
        },
      ],
    };
  }

  const attachmentMimeTypeRaw = (
    input.attachmentMimeType ?? "image/jpeg"
  )
    .trim()
    .toLowerCase();
  if (
    hasImage &&
    attachmentMimeTypeRaw &&
    !attachmentMimeTypeRaw.startsWith("image/")
  ) {
    return {
      status: "error",
      message: "That image format isn’t supported. Try JPEG, PNG or a screenshot.",
    };
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

  // Ownership: path must live under this user's folder.
  if (attachmentPath && !isOwnedCoachAttachmentPath(user.id, attachmentPath)) {
    console.error("[coach] Rejected attachment path outside user folder");
    return {
      status: "error",
      message: "That photo couldn’t be attached. Try again.",
    };
  }

  try {
    const supabase = await createClient();

    let attachmentMimeType: string | null = null;
    let attachmentKind: "image" | null = null;

    if (attachmentPath) {
      // Confirm the object exists before linking it to a message.
      const { data: signed, error: verifyError } = await supabase.storage
        .from(COACH_ATTACHMENT_BUCKET)
        .createSignedUrl(attachmentPath, 60);
      if (verifyError || !signed?.signedUrl) {
        console.error(
          "[coach] Attachment verify failed:",
          verifyError?.message ?? "Missing object",
        );
        return {
          status: "error",
          message: "That photo upload wasn’t found. Try attaching it again.",
        };
      }
      attachmentMimeType = attachmentMimeTypeRaw || "image/jpeg";
      attachmentKind = "image";
    }

    const { error: insertError } = await supabase.from("coach_messages").insert({
      conversation_id: input.conversationId,
      user_id: user.id,
      role: "user",
      content,
      attachment_path: attachmentPath,
      attachment_mime_type: attachmentMimeType,
      attachment_kind: attachmentKind,
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

    const scope = classifyCoachScope(content);
    if (scope === "out_of_scope" || scope === "safety_urgent") {
      const reply =
        scope === "safety_urgent"
          ? coachSafetyUrgentReply()
          : coachOutOfScopeReply();
      const { data: assistantRow, error: assistantError } = await supabase
        .from("coach_messages")
        .insert({
          conversation_id: input.conversationId,
          user_id: user.id,
          role: "assistant",
          content: reply,
        })
        .select(MESSAGE_SELECT)
        .single();

      if (assistantError || !assistantRow) {
        console.error(
          "[coach] Scoped reply save failed:",
          assistantError?.message ?? "No row",
        );
        return {
          status: "error",
          message: "Your message couldn’t be sent. Try again.",
        };
      }

      const messages = await loadMessages(input.conversationId, user.id);
      let nextConversation = conversation;
      if (!conversation.title) {
        const title = titleFallbackFromMessage(content);
        if (title) {
          await supabase
            .from("coach_conversations")
            .update({ title, updated_at: new Date().toISOString() })
            .eq("id", input.conversationId)
            .eq("user_id", user.id);
          nextConversation = { ...conversation, title };
        }
      } else {
        await supabase
          .from("coach_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", input.conversationId)
          .eq("user_id", user.id);
      }

      return {
        status: "ok",
        conversation: nextConversation,
        messages,
      };
    }

    // Verbal confirmation: apply pending proposals before the next coach reply
    // so the model sees the updated canonical state and can confirm what saved.
    if (isCoachAffirmation(content)) {
      const trainingPending = await listPendingTrainingProposals({
        conversationId: input.conversationId,
      });
      if (trainingPending.status === "ok") {
        for (const proposal of trainingPending.proposals) {
          const accepted = await acceptTrainingPlanProposal({
            proposalId: proposal.id,
          });
          if (accepted.status === "error") {
            console.error(
              "[coach] Verbal plan accept failed:",
              accepted.message,
            );
          }
        }
      }
      const changeAccepted = await acceptPendingCoachChangesForConversation({
        conversationId: input.conversationId,
      });
      if (changeAccepted.status === "error") {
        console.error(
          "[coach] Verbal change accept failed:",
          changeAccepted.message,
        );
      }
    }

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

/**
 * Press-to-talk: transcribe recorded audio into draft text.
 * Audio is not persisted — only the transcript is returned to the client.
 */
export async function transcribeCoachAudio(input: {
  audioBase64: string;
  mimeType: string;
}): Promise<TranscribeCoachAudioResult> {
  const validated = validateCoachAudioAttachment({
    audioBase64: input.audioBase64,
    mimeType: input.mimeType,
  });
  if (!validated.ok) {
    return { status: "error", message: validated.message };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  if (!isGeminiConfigured()) {
    return {
      status: "error",
      message:
        "Voice input isn’t connected right now. Check GEMINI_API_KEY and try again.",
    };
  }

  try {
    const provider = new GeminiProvider();
    const { transcript } = await provider.transcribeCoachAudio({
      audioBase64: input.audioBase64.replace(/\s+/g, ""),
      mimeType: validated.mimeType,
    });
    const cleaned = transcript.trim();
    if (!cleaned) {
      return {
        status: "error",
        message: "I couldn’t catch that. Try recording again.",
      };
    }
    return { status: "ok", transcript: cleaned };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown transcription error";
    console.error("[coach] Transcription failed:", message);
    return {
      status: "error",
      message: "That recording couldn’t be transcribed. Try again.",
    };
  }
}
