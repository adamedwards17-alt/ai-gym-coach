"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  createCoachConversation,
  listCoachConversations,
} from "@/app/actions/coach";
import type { CoachConversationRecord } from "@/lib/coach";

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

export function CoachHome() {
  const router = useRouter();
  const [conversations, setConversations] = useState<
    CoachConversationRecord[]
  >([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      <header className="mb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Coach
        </p>
        <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-5xl">
          Your coach
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-muted">
          Ask about training, nutrition, recovery — I’ll answer with your day
          in mind.
        </p>
      </header>

      {error ? (
        <p role="alert" className="mb-6 text-[13px] leading-6 text-muted">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={pending}
        onClick={handleNewChat}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60 sm:w-fit"
      >
        {pending ? "Starting…" : "+ New chat"}
      </button>

      <section className="mt-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Recent conversations
        </p>

        {conversations.length === 0 ? (
          <p className="mt-5 text-[15px] leading-7 text-muted">
            No chats yet. Start one when you want advice grounded in how you’re
            actually training and eating.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Link
                  href={`/coach/${conversation.id}`}
                  className="flex flex-col gap-1 rounded-2xl px-3 py-3 transition-colors hover:bg-white/[0.04]"
                >
                  <span className="text-[15px] text-foreground">
                    {conversation.title?.trim() || "New chat"}
                  </span>
                  <span className="text-[12px] text-muted">
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
