import type { Metadata } from "next";
import { CoachMark } from "@/components/CoachMark";

export const metadata: Metadata = { title: "Coach" };

export default function CoachPage() {
  return (
    <section className="relative mx-auto flex min-h-[calc(100dvh-8.5rem)] w-full max-w-2xl flex-col px-5 py-8 sm:min-h-[calc(100dvh-7rem)] sm:px-8 sm:py-10">
      <div
        className="pointer-events-none absolute left-1/2 top-8 h-52 w-52 -translate-x-1/2 rounded-full opacity-25 blur-3xl coach-gradient"
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col items-center justify-center text-center">
        <CoachMark size="md" />
        <h1 className="mt-6 font-serif text-3xl tracking-tight sm:text-4xl">
          Your coach
        </h1>
        <p className="mt-4 max-w-sm text-[15px] leading-7 text-muted">
          I’m here when you’re ready. We’ll start with how you train, how you
          eat, and how you recover — then I’ll keep us honest.
        </p>
      </div>

      <div className="relative pt-8" aria-hidden>
        <div className="flex h-[3.25rem] items-center rounded-full border border-border bg-surface/60 px-5 text-[15px] text-muted shadow-[0_0_0_1px_rgb(255_255_255/0.02)]">
          Message your coach
        </div>
        <p className="mt-3 text-center text-[11px] text-muted/70">
          Conversations aren’t connected yet.
        </p>
      </div>
    </section>
  );
}
