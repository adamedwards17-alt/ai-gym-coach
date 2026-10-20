"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { buttonClassName } from "@/components/ui/Button";
import type { MorningRecap } from "@/lib/morning-recap";
import { morningRecapStorageKey } from "@/lib/morning-recap";

type MorningRecapPanelProps = {
  localDate: string;
  recap: MorningRecap;
  hasCheckIn: boolean;
  onStartCheckIn: () => void;
};

export function MorningRecapPanel({
  localDate,
  recap,
  hasCheckIn,
  onStartCheckIn,
}: MorningRecapPanelProps) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    const key = morningRecapStorageKey(localDate);
    queueMicrotask(() => {
      try {
        setDismissed(window.localStorage.getItem(key) === "1");
      } catch {
        setDismissed(false);
      }
    });
  }, [localDate]);

  if (dismissed !== false || recap.observations.length === 0) {
    return null;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(morningRecapStorageKey(localDate), "1");
    } catch {
      // Ignore storage failures — still hide for this visit.
    }
    setDismissed(true);
  }

  return (
    <section className="today-reveal mb-4 rounded-2xl border border-border bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Yesterday
          </p>
          <h2 className="mt-2 font-serif text-[1.35rem] leading-snug tracking-tight">
            Morning check-in
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          Dismiss
        </button>
      </div>

      <ul className="mt-4 space-y-2.5">
        {recap.observations.map((item) => (
          <li
            key={item.id}
            className="text-[14px] leading-6 text-foreground/92"
          >
            {item.text}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] leading-6 text-muted">
        Today: {recap.todayPlanLine}
      </p>

      {recap.actions.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2">
          {recap.actions.map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className={buttonClassName("secondary")}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}

      {!hasCheckIn ? (
        <button
          type="button"
          onClick={onStartCheckIn}
          className={`${buttonClassName()} mt-4`}
        >
          Quick check-in
        </button>
      ) : null}
    </section>
  );
}
