"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { openCoachingIntentChat } from "@/app/actions/coaching-intents";
import {
  createCoachConversation,
  listCoachConversations,
} from "@/app/actions/coach";
import type { CoachConversationRecord } from "@/lib/coach";
import { Button } from "@/components/ui/Button";
import { cardClass, EmptyState, PageHeader, SectionTitle } from "@/components/ui/surfaces";
import { isCoachingIntent } from "@/lib/coaching-intents";

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function CoachHome({ intent }: { intent?: string | null }) {
  const router = useRouter();
  const intentStarted = useRef(false);
  const [conversations, setConversations] = useState<
    CoachConversationRecord[]
  >([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!intent || !isCoachingIntent(intent) || intentStarted.current) {
      return;
    }
    intentStarted.current = true;
    void openCoachingIntentChat(intent).then((result) => {
      if (result.status !== "ok") {
        setError(result.message);
        return;
      }
      const draft = result.draft
        ? `?draft=${encodeURIComponent(result.draft)}`
        : "";
      router.replace(`/coach/${result.conversationId}${draft}`);
    });
  }, [intent, router]);

  useEffect(() => {
    let cancelled = false;

    void listCoachConversations().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setConversations(result.conversations);
        setError(null);
      } else {
        setError(result.message);
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleNewChat() {
    startTransition(async () => {
      setError(null);
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

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <PageHeader
        eyebrow="Coach"
        title="Your coach"
        detail="Ask about training, nutrition or recovery. Answers use your day."
      />

      {error ? (
        <p role="alert" className="mb-6 text-[13px] leading-6 text-muted">
          {error}
        </p>
      ) : null}

      <Button disabled={pending} onClick={handleNewChat} className="w-full sm:w-fit">
        {pending ? "Starting…" : "New chat"}
      </Button>

      <section className="mt-6">
        <SectionTitle>Recent conversations</SectionTitle>

        {conversations.length === 0 ? (
          <EmptyState>
            No chats yet. Start one when you want advice grounded in how you’re
            actually training and eating.
          </EmptyState>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/coach/${conversation.id}`}
                  className={`${cardClass} block px-4 py-4 transition-colors hover:border-primary/40`}
                >
                  <span className="block text-[15px] font-semibold text-foreground">
                    {conversation.title?.trim() || "New chat"}
                  </span>
                  <span className="mt-1 block text-[12px] text-muted">
                    {formatUpdatedAt(conversation.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
