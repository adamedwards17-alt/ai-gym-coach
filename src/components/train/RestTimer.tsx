"use client";

import { useEffect, useRef, useState } from "react";

type RestTimerProps = {
  seconds: number;
  onComplete?: () => void;
};

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * Rest countdown. Starts automatically on mount, so the parent should pass a
 * `key` (e.g. exercise id + restSeconds + set number) to restart it.
 * Renders inline and never blocks the rest of the page.
 */
export function RestTimer({ seconds, onComplete }: RestTimerProps) {
  const total = Math.max(1, Math.round(seconds));
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(true);
  const remainingRef = useRef(total);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!running) {
      return;
    }
    const endAt = Date.now() + remainingRef.current * 1000;
    const interval = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      remainingRef.current = left;
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(interval);
        setRunning(false);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(200);
        }
        onCompleteRef.current?.();
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running]);

  function handleToggle() {
    if (remaining <= 0) {
      return;
    }
    setRunning((value) => !value);
  }

  function handleReset() {
    remainingRef.current = total;
    setRemaining(total);
    setRunning(true);
  }

  function handleSkip() {
    remainingRef.current = 0;
    setRemaining(0);
    setRunning(false);
    onCompleteRef.current?.();
  }

  const fillPercent = Math.min(
    100,
    Math.max(0, ((total - remaining) / total) * 100),
  );

  return (
    <div
      className="border-t border-border/60 pt-4"
      role="timer"
      aria-live="off"
      aria-label="Rest timer"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Rest
        </p>
        <p className="font-serif text-[1.85rem] leading-none tabular-nums tracking-tight">
          {formatClock(remaining)}
        </p>
      </div>
      <div className="mt-3 h-px w-full bg-border/60">
        <div
          className="h-px bg-foreground/70 transition-[width] duration-300"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-50"
          disabled={remaining <= 0}
          onClick={handleToggle}
        >
          {running ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] text-foreground"
          onClick={handleReset}
        >
          Reset
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center rounded-full px-3 text-[13px] text-muted transition-colors hover:text-foreground"
          onClick={handleSkip}
        >
          Skip rest
        </button>
      </div>
    </div>
  );
}
