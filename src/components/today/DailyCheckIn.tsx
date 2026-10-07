"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CoachMessage } from "@/components/today/CoachMessage";
import { DailyFocus } from "@/components/today/DailyFocus";
import { OptionSelector } from "@/components/today/OptionSelector";
import { SleepRating } from "@/components/today/SleepRating";
import { UserResponse } from "@/components/today/UserResponse";
import { getDisplayName } from "@/lib/profile";
import {
  feelingOptions,
  getCoachTake,
  getDailyFocus,
  greetingForHour,
  labelForFeeling,
  labelForPlan,
  labelForSleep,
  planOptions,
  type FeelingId,
  type PlanId,
  type SleepScore,
  type TodayCheckIn,
} from "@/lib/today";

type Step = "feeling" | "sleep" | "plan" | "done";

const emptyCheckIn: TodayCheckIn = {
  feeling: null,
  sleep: null,
  plan: null,
};

export function DailyCheckIn() {
  const [checkIn, setCheckIn] = useState<TodayCheckIn>(emptyCheckIn);
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour, getDisplayName());

  const step: Step = !checkIn.feeling
    ? "feeling"
    : !checkIn.sleep
      ? "sleep"
      : !checkIn.plan
        ? "plan"
        : "done";

  const coachTake = useMemo(() => getCoachTake(checkIn), [checkIn]);
  const focus = useMemo(() => getDailyFocus(checkIn), [checkIn]);

  useEffect(() => {
    const targetId =
      step === "sleep"
        ? "today-q-sleep"
        : step === "plan"
          ? "today-q-plan"
          : step === "done"
            ? "today-coach"
            : null;

    if (!targetId) {
      return;
    }

    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [step]);

  function editFeeling() {
    setCheckIn(emptyCheckIn);
  }

  function editSleep() {
    setCheckIn((current) => ({ ...current, sleep: null, plan: null }));
  }

  function editPlan() {
    setCheckIn((current) => ({ ...current, plan: null }));
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <header className="mb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Today
        </p>
        <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-5xl">
          {greeting}
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-muted">
          Let’s make today count.
        </p>
      </header>

      <div className="flex flex-col gap-7">
        <CoachMessage>How are you feeling today?</CoachMessage>
        {checkIn.feeling && step !== "feeling" ? (
          <UserResponse
            label={labelForFeeling(checkIn.feeling)}
            onEdit={editFeeling}
          />
        ) : (
          <OptionSelector
            name="How you feel"
            options={feelingOptions}
            value={checkIn.feeling}
            onChange={(feeling: FeelingId) =>
              setCheckIn((current) => ({
                ...current,
                feeling,
                sleep: null,
                plan: null,
              }))
            }
          />
        )}

        {checkIn.feeling ? (
          <>
            <CoachMessage id="today-q-sleep">
              Got it. How did you sleep?
            </CoachMessage>
            {checkIn.sleep && step !== "sleep" ? (
              <UserResponse
                label={labelForSleep(checkIn.sleep)}
                onEdit={editSleep}
              />
            ) : (
              <SleepRating
                value={checkIn.sleep}
                onChange={(sleep: SleepScore) =>
                  setCheckIn((current) => ({
                    ...current,
                    sleep,
                    plan: null,
                  }))
                }
              />
            )}
          </>
        ) : null}

        {checkIn.sleep ? (
          <>
            <CoachMessage id="today-q-plan">
              And what’s on the plan today?
            </CoachMessage>
            {checkIn.plan && step !== "plan" ? (
              <UserResponse
                label={labelForPlan(checkIn.plan)}
                onEdit={editPlan}
              />
            ) : (
              <OptionSelector
                name="Today’s plan"
                options={planOptions}
                value={checkIn.plan}
                onChange={(plan: PlanId) =>
                  setCheckIn((current) => ({ ...current, plan }))
                }
              />
            )}
          </>
        ) : null}

        {coachTake ? (
          <>
            <CoachMessage
              id="today-coach"
              footnote={
                coachTake.source === "preview"
                  ? "Preview — not live AI yet."
                  : undefined
              }
            >
              {coachTake.text}
            </CoachMessage>
            <DailyFocus items={focus} />
            <div className="today-reveal pt-2 pl-10">
              <Link
                href="/"
                className="text-[13px] text-muted transition-colors hover:text-foreground"
              >
                Back to my day
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
