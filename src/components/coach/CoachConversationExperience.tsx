"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { listPendingCoachChangeProposals } from "@/app/actions/coach-changes";
import {
  createCoachConversation,
  loadCoachConversation,
  retryCoachReply,
  sendCoachMessage,
  transcribeCoachAudio,
} from "@/app/actions/coach";
import { listPendingTrainingProposals } from "@/app/actions/training";
import { CoachComposer } from "@/components/coach/CoachComposer";
import { CoachPlanUpdateBundle } from "@/components/coach/CoachPlanUpdateBundle";
import { CoachMessage } from "@/components/today/CoachMessage";
import {
  getLocalCoachDate,
  type CoachConversationRecord,
  type CoachMessageRecord,
} from "@/lib/coach";
import { coachImageOnlyContent } from "@/lib/coach-attachments";
import type { CoachChangeProposalRecord } from "@/lib/coach-change-proposals";
import { getCoachLoadingMessage } from "@/lib/coach-loading";
import {
  hasSentMealInspirationQuickReply,
  isMealInspirationConversation,
  MEAL_INSPIRATION_QUICK_REPLIES,
} from "@/lib/meal-inspiration";
import type { TrainingPlanProposalRecord } from "@/lib/training-plan";

type CoachConversationExperienceProps = {
  conversationId: string;
  initialDraft?: string;
};

export function CoachConversationExperience({
  conversationId,
  initialDraft = "",
}: CoachConversationExperienceProps) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [conversation, setConversation] =
    useState<CoachConversationRecord | null>(null);
  const [messages, setMessages] = useState<CoachMessageRecord[]>([]);
  const [proposals, setProposals] = useState<TrainingPlanProposalRecord[]>([]);
  const [changeProposals, setChangeProposals] = useState<
    CoachChangeProposalRecord[]
  >([]);
  const [draft, setDraft] = useState(initialDraft);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pending, startTransition] = useTransition();
  const [creating, startCreate] = useTransition();
  const [loadingMessage, setLoadingMessage] = useState(
    "Thinking that through…",
  );
  const busy = sending || pending;

  const refreshProposals = useCallback(() => {
    void listPendingTrainingProposals({ conversationId }).then((result) => {
      if (result.status === "ok") {
        setProposals(result.proposals);
      }
    });
    void listPendingCoachChangeProposals({ conversationId }).then((result) => {
      if (result.status === "ok") {
        setChangeProposals(result.proposals);
      }
    });
  }, [conversationId]);

  useEffect(() => {
    let cancelled = false;

    void loadCoachConversation(conversationId).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setConversation(result.conversation);
        setMessages(result.messages);
        setError(null);
      } else if (result.status === "not_found") {
        setError("That chat couldn’t be found.");
      } else {
        setError(result.message);
      }
      setReady(true);
    });

    void listPendingTrainingProposals({ conversationId }).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setProposals(result.proposals);
      }
    });

    void listPendingCoachChangeProposals({ conversationId }).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setChangeProposals(result.proposals);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, proposals, changeProposals]);

  async function sendContent(input: {
    content: string;
    attachmentPath?: string | null;
    attachmentMimeType?: string | null;
    previewUrl?: string | null;
  }): Promise<{ ok: boolean; message?: string }> {
    const trimmed = input.content.trim();
    const hasImage = Boolean(input.attachmentPath);
    if ((!trimmed && !hasImage) || busy) {
      return { ok: false, message: "Write a message for your coach." };
    }

    const displayContent = trimmed || coachImageOnlyContent();
    setError(null);
    setSending(true);
    setLoadingMessage(
      hasImage
        ? "Looking at your photo…"
        : getCoachLoadingMessage(displayContent),
    );

    const optimisticId = `local-${conversationId}-${crypto.randomUUID()}`;
    const optimistic: CoachMessageRecord = {
      id: optimisticId,
      conversation_id: conversationId,
      role: "user",
      content: displayContent,
      created_at: new Date(0).toISOString(),
      attachment_path: input.attachmentPath ?? null,
      attachment_mime_type: input.attachmentMimeType ?? null,
      attachment_kind: hasImage ? "image" : null,
      attachment_url: input.previewUrl ?? null,
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const result = await sendCoachMessage({
        conversationId,
        content: trimmed,
        localDate: getLocalCoachDate(),
        attachmentPath: input.attachmentPath ?? null,
        attachmentMimeType: input.attachmentMimeType ?? null,
      });

      if (result.status === "ok") {
        setConversation(result.conversation);
        setMessages(result.messages);
        refreshProposals();
        router.refresh();
        setError(null);
        return { ok: true };
      }

      // Keep draft/attachment in the composer; restore messages without the
      // optimistic bubble (or use server list when available).
      if (result.messages) {
        setMessages(result.messages);
      } else {
        setMessages((current) =>
          current.filter((message) => message.id !== optimisticId),
        );
      }
      if (result.conversation) {
        setConversation(result.conversation);
      }
      setError(result.message);
      return { ok: false, message: result.message };
    } catch (error) {
      console.error("[coach] Send crashed:", error);
      setMessages((current) =>
        current.filter((message) => message.id !== optimisticId),
      );
      const message =
        "That message couldn’t be sent. Check your connection and try again.";
      setError(message);
      return { ok: false, message };
    } finally {
      setSending(false);
    }
  }

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retryCoachReply({
        conversationId,
        localDate: getLocalCoachDate(),
      });

      if (result.status === "ok") {
        setConversation(result.conversation);
        setMessages(result.messages);
        refreshProposals();
        setError(null);
        return;
      }

      if (result.messages) {
        setMessages(result.messages);
      }
      if (result.conversation) {
        setConversation(result.conversation);
      }
      setError(result.message);
    });
  }

  function handleNewChat() {
    startCreate(async () => {
      const result = await createCoachConversation();
      if (result.status !== "created") {
        setError(result.message);
        return;
      }
      router.push(`/coach/${result.conversation.id}`);
    });
  }

  if (!ready) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">
        Loading…
      </p>
    );
  }

  if (!conversation) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16 sm:max-w-lg">
        <p className="text-[15px] leading-7 text-muted">
          {error ?? "That chat couldn’t be found."}
        </p>
        <Link
          href="/coach"
          className="mt-6 inline-flex text-[13px] text-muted transition-colors hover:text-foreground"
        >
          ← Back to Coach
        </Link>
      </div>
    );
  }

  const lastIsUser =
    messages.length > 0 && messages[messages.length - 1]?.role === "user";

  const showMealInspirationQuickReplies =
    isMealInspirationConversation(conversation.title) &&
    !busy &&
    messages.some((message) => message.role === "assistant") &&
    !hasSentMealInspirationQuickReply(messages);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8.5rem)] w-full max-w-md flex-col px-5 pb-28 pt-6 sm:max-w-lg sm:min-h-[calc(100dvh-7rem)] sm:px-6 sm:pb-10 sm:pt-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/coach"
            className="text-[12px] text-muted transition-colors hover:text-foreground"
          >
            ← Coach
          </Link>
          <h1 className="mt-3 truncate font-serif text-[1.75rem] leading-tight tracking-tight sm:text-4xl">
            {conversation.title?.trim() || "New chat"}
          </h1>
        </div>
        <button
          type="button"
          disabled={creating}
          onClick={handleNewChat}
          className="shrink-0 text-[13px] text-muted transition-colors hover:text-foreground disabled:opacity-60"
        >
          + New
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-6">
        {messages.length === 0 && !pending ? (
          <CoachMessage>
            What’s on your mind — training, food, recovery, or something else?
          </CoachMessage>
        ) : null}

        {messages.map((message) =>
          message.role === "assistant" ? (
            <CoachMessage key={message.id}>{message.content}</CoachMessage>
          ) : (
            <div key={message.id} className="flex justify-end pl-10">
              <div className="max-w-[90%] rounded-3xl rounded-br-md bg-white/[0.07] px-4 py-3 text-[15px] leading-7 text-foreground">
                {message.attachment_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={message.attachment_url}
                    alt="Attached photo"
                    className="mb-2 max-h-48 w-full rounded-2xl object-cover"
                  />
                ) : null}
                <p>{message.content}</p>
              </div>
            </div>
          ),
        )}

        {busy ? (
          <CoachMessage footnote="Thinking…">{loadingMessage}</CoachMessage>
        ) : null}

        {proposals.length > 0 || changeProposals.length > 0 ? (
          <div className="space-y-3 pl-0 sm:pl-2">
            <CoachPlanUpdateBundle
              conversationId={conversationId}
              changeProposals={changeProposals}
              planProposals={proposals}
              onResolved={() => {
                refreshProposals();
                router.refresh();
              }}
            />
          </div>
        ) : null}

        {error ? (
          <div className="flex flex-col gap-3 pl-10">
            <p role="alert" className="text-[13px] leading-6 text-muted">
              {error}
            </p>
            {lastIsUser ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleRetry}
                className="inline-flex h-10 w-fit items-center rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-60"
              >
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {showMealInspirationQuickReplies ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {MEAL_INSPIRATION_QUICK_REPLIES.map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={busy}
              onClick={() => {
                void sendContent({ content: reply });
              }}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[13px] text-foreground transition-colors hover:border-white/16 hover:bg-white/[0.04] disabled:opacity-60"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}

      <CoachComposer
        conversationId={conversationId}
        draft={draft}
        pending={busy}
        onDraftChange={setDraft}
        onSend={sendContent}
        onTranscribe={transcribeCoachAudio}
      />
    </div>
  );
}
