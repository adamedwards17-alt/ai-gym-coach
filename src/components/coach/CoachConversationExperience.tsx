"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createCoachConversation,
  loadCoachConversation,
  retryCoachReply,
  sendCoachMessage,
} from "@/app/actions/coach";
import { listPendingTrainingProposals } from "@/app/actions/training";
import { PlanProposalCard } from "@/components/train/PlanProposalCard";
import { CoachMessage } from "@/components/today/CoachMessage";
import {
  getLocalCoachDate,
  type CoachConversationRecord,
  type CoachMessageRecord,
} from "@/lib/coach";
import {
  hasSentMealInspirationQuickReply,
  isMealInspirationConversation,
  MEAL_INSPIRATION_QUICK_REPLIES,
} from "@/lib/meal-inspiration";
import type { TrainingPlanProposalRecord } from "@/lib/training-plan";

type CoachConversationExperienceProps = {
  conversationId: string;
};

export function CoachConversationExperience({
  conversationId,
}: CoachConversationExperienceProps) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [conversation, setConversation] =
    useState<CoachConversationRecord | null>(null);
  const [messages, setMessages] = useState<CoachMessageRecord[]>([]);
  const [proposals, setProposals] = useState<TrainingPlanProposalRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, startCreate] = useTransition();

  const refreshProposals = useCallback(() => {
    void listPendingTrainingProposals({ conversationId }).then((result) => {
      if (result.status === "ok") {
        setProposals(result.proposals);
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

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  function sendContent(content: string) {
    const trimmed = content.trim();
    if (!trimmed || pending) {
      return;
    }

    setDraft("");
    setError(null);

    const optimistic: CoachMessageRecord = {
      id: `local-${conversationId}-${messages.length}-${trimmed.length}`,
      conversation_id: conversationId,
      role: "user",
      content: trimmed,
      created_at: new Date(0).toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    startTransition(async () => {
      const result = await sendCoachMessage({
        conversationId,
        content: trimmed,
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

  function handleSend() {
    sendContent(draft);
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
    !pending &&
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
              <p className="max-w-[90%] rounded-3xl rounded-br-md bg-white/[0.07] px-4 py-3 text-[15px] leading-7 text-foreground">
                {message.content}
              </p>
            </div>
          ),
        )}

        {pending ? (
          <CoachMessage footnote="Thinking…">
            Looking at your day…
          </CoachMessage>
        ) : null}

        {proposals.length > 0 ? (
          <div className="space-y-3 pl-0 sm:pl-2">
            {proposals.map((proposal) => (
              <PlanProposalCard
                key={proposal.id}
                proposal={proposal}
                onResolved={refreshProposals}
              />
            ))}
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
                disabled={pending}
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
              disabled={pending}
              onClick={() => sendContent(reply)}
              className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[13px] text-foreground transition-colors hover:border-white/16 hover:bg-white/[0.04] disabled:opacity-60"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="sticky bottom-20 mt-8 sm:bottom-6"
        onSubmit={(event) => {
          event.preventDefault();
          handleSend();
        }}
      >
        <label className="sr-only" htmlFor="coach-composer">
          Message your coach
        </label>
        <div className="flex items-end gap-2 rounded-full border border-border bg-surface/80 p-1.5 shadow-[0_0_0_1px_rgb(255_255_255/0.02)] backdrop-blur">
          <textarea
            id="coach-composer"
            rows={1}
            value={draft}
            disabled={pending}
            placeholder="Message your coach"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted disabled:opacity-60"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
