"use client";

import { useEffect, useRef, useState } from "react";
import {
  saveTodaysCheckIn,
  saveTodaysCoachTake,
} from "@/app/actions/check-in";
import { requestCoachTake } from "@/app/actions/coach-take";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import { UserResponse } from "@/components/today/UserResponse";
import { checkInKey, getLocalCheckInDate } from "@/lib/check-ins";
import { getDisplayName } from "@/lib/profile";
import {
  emptyTodayCheckIn,
  feelingOptions,
  feelingRatingOptions,
  greetingForHour,
  isCheckInComplete,
  labelForFeeling,
  labelForPlan,
  labelForSleepHours,
  labelForSleepQuality,
  planOptions,
  sleepHoursOptions,
  sleepQualityOptions,
  sleepQualityToRating,
  type FeelingId,
  type FeelingRating,
  type PlanId,
  type SleepHoursOption,
  type SleepQualityId,
  type TodayCheckIn,
} from "@/lib/today";

type Step =
  | "sleepHours"
  | "sleepQuality"
  | "feelingRating"
  | "feeling"
  | "plan"
  | "done";

type MorningCheckInProps = {
  displayName: string;
  initialCheckIn?: TodayCheckIn | null;
  onCompleted: (checkIn: TodayCheckIn, coachTakeText: string | null) => void;
  onCancel?: () => void;
};

function stepFor(checkIn: TodayCheckIn): Step {
  if (checkIn.sleepHours === null) {
    return "sleepHours";
  }
  if (checkIn.sleepQuality === null) {
    return "sleepQuality";
  }
  if (checkIn.feelingRating === null) {
    return "feelingRating";
  }
  if (checkIn.feeling === null) {
    return "feeling";
  }
  if (checkIn.plan === null) {
    return "plan";
  }
  return "done";
}

function submittedKeyFor(checkIn: TodayCheckIn): string | null {
  if (!isCheckInComplete(checkIn)) {
    return null;
  }
  return checkInKey({
    feeling: checkIn.feeling,
    sleep: checkIn.sleep,
    plan: checkIn.plan,
    sleepHours: checkIn.sleepHours,
    sleepQuality: checkIn.sleepQuality,
    feelingRating: checkIn.feelingRating,
  });
}

export function MorningCheckIn({
  displayName,
  initialCheckIn,
  onCompleted,
  onCancel,
}: MorningCheckInProps) {
  const [checkIn, setCheckIn] = useState<TodayCheckIn>(
    initialCheckIn ?? emptyTodayCheckIn,
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const checkInDateRef = useRef(getLocalCheckInDate());
  // When editing an existing complete check-in, skip auto-save until the user changes something.
  const submittedKeyRef = useRef<string | null>(
    submittedKeyFor(initialCheckIn ?? emptyTodayCheckIn),
  );
  const hour = new Date().getHours();
  const firstName = getDisplayName(displayName);
  const greeting = greetingForHour(hour, firstName);
  const step = stepFor(checkIn);

  useEffect(() => {
    checkInDateRef.current = getLocalCheckInDate();
  }, []);

  useEffect(() => {
    if (!isCheckInComplete(checkIn)) {
      return;
    }

    const key = checkInKey({
      feeling: checkIn.feeling,
      sleep: checkIn.sleep,
      plan: checkIn.plan,
      sleepHours: checkIn.sleepHours,
      sleepQuality: checkIn.sleepQuality,
      feelingRating: checkIn.feelingRating,
    });

    if (submittedKeyRef.current === key) {
      return;
    }

    submittedKeyRef.current = key;
    let cancelled = false;
    setSaving(true);
    setSaveError(null);

    void (async () => {
      const saveResult = await saveTodaysCheckIn({
        checkInDate: checkInDateRef.current,
        checkIn,
      });

      if (cancelled) {
        return;
      }

      if (saveResult.status !== "saved") {
        setSaveError(saveResult.message);
        setSaving(false);
        submittedKeyRef.current = null;
        return;
      }

      let coachTakeText: string | null = null;
      try {
        const result = await requestCoachTake(checkIn);
        if (cancelled) {
          return;
        }
        coachTakeText = result.text;
        if (result.source === "gemini") {
          const persist = await saveTodaysCoachTake({
            checkInDate: checkInDateRef.current,
            coachTake: result.text,
          });
          if (persist.status !== "saved") {
            console.error("[check-in]", persist.message);
          }
        }
      } catch {
        coachTakeText =
          "Keep today sensible. Listen to your body and protect tonight’s sleep.";
      }

      if (cancelled) {
        return;
      }

      setSaving(false);
      onCompleted(checkIn, coachTakeText);
    })();

    return () => {
      cancelled = true;
    };
  }, [checkIn, onCompleted]);

  useEffect(() => {
    const targetId =
      step === "sleepQuality"
        ? "today-q-quality"
        : step === "feelingRating"
          ? "today-q-feeling-rating"
          : step === "feeling"
            ? "today-q-feeling"
            : step === "plan"
              ? "today-q-plan"
              : null;

    if (!targetId) {
      return;
    }

    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [step]);

  function resetFrom(partial: Partial<TodayCheckIn>) {
    submittedKeyRef.current = null;
    setSaveError(null);
    setSaving(false);
    setCheckIn((current) => ({ ...current, ...partial }));
  }

  return (
    <section id="check-in" className="today-reveal scroll-mt-24">
      <header className="mb-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Check-in
        </p>
        <h2 className="mt-2 font-serif text-[1.75rem] leading-tight tracking-tight">
          {hour < 12 ? `Morning, ${firstName || "there"}.` : greeting}
        </h2>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          How did you sleep?
        </p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 text-[13px] text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        ) : null}
      </header>

      <div className="flex flex-col gap-7">
        <CoachMessage>About how many hours?</CoachMessage>
        {checkIn.sleepHours !== null && step !== "sleepHours" ? (
          <UserResponse
            label={labelForSleepHours(checkIn.sleepHours)}
            onEdit={() =>
              resetFrom({
                sleepHours: null,
                sleepQuality: null,
                feelingRating: null,
                feeling: null,
                sleep: null,
                plan: null,
              })
            }
          />
        ) : (
          <OptionSelector
            name="Sleep hours"
            options={sleepHoursOptions}
            value={checkIn.sleepHours}
            onChange={(sleepHours: SleepHoursOption) => {
              resetFrom({
                sleepHours,
                sleepQuality: null,
                feelingRating: null,
                feeling: null,
                sleep: null,
                plan: null,
              });
            }}
          />
        )}

        {checkIn.sleepHours !== null ? (
          <>
            <CoachMessage id="today-q-quality">
              How was the quality?
            </CoachMessage>
            {checkIn.sleepQuality !== null && step !== "sleepQuality" ? (
              <UserResponse
                label={labelForSleepQuality(checkIn.sleepQuality)}
                onEdit={() =>
                  resetFrom({
                    sleepQuality: null,
                    feelingRating: null,
                    feeling: null,
                    sleep: null,
                    plan: null,
                  })
                }
              />
            ) : (
              <OptionSelector
                name="Sleep quality"
                options={sleepQualityOptions}
                value={checkIn.sleepQuality}
                onChange={(sleepQuality: SleepQualityId) => {
                  resetFrom({
                    sleepQuality,
                    sleep: sleepQualityToRating(sleepQuality),
                    feelingRating: null,
                    feeling: null,
                    plan: null,
                  });
                }}
              />
            )}
          </>
        ) : null}

        {checkIn.sleepQuality !== null ? (
          <>
            <CoachMessage id="today-q-feeling-rating">
              And how are you feeling?
            </CoachMessage>
            {checkIn.feelingRating !== null && step !== "feelingRating" ? (
              <UserResponse
                label={`${checkIn.feelingRating} / 5`}
                onEdit={() =>
                  resetFrom({
                    feelingRating: null,
                    feeling: null,
                    plan: null,
                  })
                }
              />
            ) : (
              <OptionSelector
                name="Feeling rating"
                options={feelingRatingOptions}
                value={checkIn.feelingRating}
                onChange={(feelingRating: FeelingRating) => {
                  resetFrom({
                    feelingRating,
                    // Ask for context next (sore / tired / strong, etc.)
                    feeling: null,
                    plan: null,
                    sleep: checkIn.sleepQuality
                      ? sleepQualityToRating(checkIn.sleepQuality)
                      : null,
                  });
                }}
              />
            )}
          </>
        ) : null}

        {checkIn.feelingRating !== null ? (
          <>
            <CoachMessage id="today-q-feeling">
              Anything else about how you feel?
            </CoachMessage>
            {checkIn.feeling !== null && step !== "feeling" ? (
              <UserResponse
                label={labelForFeeling(checkIn.feeling)}
                onEdit={() => resetFrom({ feeling: null, plan: null })}
              />
            ) : (
              <OptionSelector
                name="Feeling context"
                options={feelingOptions}
                value={checkIn.feeling}
                onChange={(feeling: FeelingId) => {
                  resetFrom({ feeling, plan: null });
                }}
              />
            )}
          </>
        ) : null}

        {checkIn.feeling !== null ? (
          <>
            <CoachMessage id="today-q-plan">
              What’s on the plan today?
            </CoachMessage>
            {checkIn.plan !== null && step !== "plan" ? (
              <UserResponse
                label={labelForPlan(checkIn.plan)}
                onEdit={() => resetFrom({ plan: null })}
              />
            ) : (
              <OptionSelector
                name="Today’s plan"
                options={planOptions}
                value={checkIn.plan}
                onChange={(plan: PlanId) => {
                  resetFrom({ plan });
                }}
              />
            )}
          </>
        ) : null}

        {saveError ? (
          <p role="alert" className="text-[13px] leading-6 text-muted">
            {saveError}
          </p>
        ) : null}

        {saving ? (
          <p className="text-[13px] text-muted">Saving check-in…</p>
        ) : null}
      </div>
    </section>
  );
}
