"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { requestCoachTake } from "@/app/actions/coach-take";
import { CoachMessage } from "@/components/today/CoachMessage";
import { DailyFocus } from "@/components/today/DailyFocus";
import { OptionSelector } from "@/components/today/OptionSelector";
import { SleepRating } from "@/components/today/SleepRating";
import { UserResponse } from "@/components/today/UserResponse";
import { getDisplayName } from "@/lib/profile";
import {
  feelingOptions,
  getDailyFocus,
  greetingForHour,
  isCheckInComplete,
  labelForFeeling,
  labelForPlan,
  labelForSleep,
  planOptions,
  type CoachTake,
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

export function DailyCheckIn({ displayName }: { displayName: string }) {
  const [checkIn, setCheckIn] = useState<TodayCheckIn>(emptyCheckIn);
  const [coachTake, setCoachTake] = useState<CoachTake | null>(null);
  const [loadingTake, setLoadingTake] = useState(false);
  const requestKeyRef = useRef<string | null>(null);
  const hour = new Date().getHours();
  const greeting = greetingForHour(hour, getDisplayName(displayName));

  const step: Step = !checkIn.feeling
    ? "feeling"
    : !checkIn.sleep
      ? "sleep"
      : !checkIn.plan
        ? "plan"
        : "done";

  const focus = useMemo(() => getDailyFocus(checkIn), [checkIn]);

  useEffect(() => {
    if (!isCheckInComplete(checkIn)) {
      return;
    }

    const key = `${checkIn.feeling}:${checkIn.sleep}:${checkIn.plan}`;
    if (requestKeyRef.current === key) {
      return;
    }
    requestKeyRef.current = key;

    let cancelled = false;
    setLoadingTake(true);
    setCoachTake(null);

    void requestCoachTake({
      feeling: checkIn.feeling,
      sleep: checkIn.sleep,
      plan: checkIn.plan,
    })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setCoachTake(result);
        setLoadingTake(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setCoachTake({
          source: "preview",
          text: "Keep today sensible. Listen to your body, hit what you can with quality, and protect tonight’s sleep.",
        });
        setLoadingTake(false);
      });

    return () => {
      cancelled = true;
    };
  }, [checkIn]);

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
  }, [step, loadingTake, coachTake]);

  function resetCoachTake() {
    requestKeyRef.current = null;
    setCoachTake(null);
    setLoadingTake(false);
  }

  function editFeeling() {
    resetCoachTake();
    setCheckIn(emptyCheckIn);
  }

  function editSleep() {
    resetCoachTake();
    setCheckIn((current) => ({ ...current, sleep: null, plan: null }));
  }

  function editPlan() {
    resetCoachTake();
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
            onChange={(feeling: FeelingId) => {
              resetCoachTake();
              setCheckIn((current) => ({
                ...current,
                feeling,
                sleep: null,
                plan: null,
              }));
            }}
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
                onChange={(sleep: SleepScore) => {
                  resetCoachTake();
                  setCheckIn((current) => ({
                    ...current,
                    sleep,
                    plan: null,
                  }));
                }}
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
                onChange={(plan: PlanId) => {
                  resetCoachTake();
                  setCheckIn((current) => ({ ...current, plan }));
                }}
              />
            )}
          </>
        ) : null}

        {loadingTake ? (
          <CoachMessage id="today-coach" footnote="Thinking…">
            One moment — shaping today’s take around you.
          </CoachMessage>
        ) : null}

        {coachTake && !loadingTake ? (
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
