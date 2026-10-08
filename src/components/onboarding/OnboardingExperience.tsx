"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AgeSlider } from "@/components/onboarding/AgeSlider";
import { MeasureInput } from "@/components/onboarding/MeasureInput";
import { MultiOptionSelector } from "@/components/onboarding/MultiOptionSelector";
import { TextReply } from "@/components/onboarding/TextReply";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import { UserResponse } from "@/components/today/UserResponse";
import {
  activityLevelOptions,
  coachingStyleOptions,
  dietOptions,
  equipmentOptions,
  firstIncompleteStep,
  isOnboardingComplete,
  labelForAnswer,
  mealsPerDayOptions,
  nutritionSupportOptions,
  onboardingStepIds,
  primaryGoalOptions,
  questionForStep,
  sexOptions,
  sleepOptions,
  trainingFrequencyOptions,
  trainingLocationOptions,
  trainingTypeOptions,
  type HeightAnswer,
  type OnboardingDraft,
  type OnboardingStepId,
  type WeightAnswer,
} from "@/lib/onboarding";
import {
  loadOnboardingDraft,
  persistOnboarding,
  saveOnboardingDraft,
  type PersistResult,
} from "@/lib/onboarding-storage";

const defaultHeight: HeightAnswer = { unit: "cm", cm: 175 };
const defaultWeight: WeightAnswer = { unit: "kg", kg: 80 };

export function OnboardingExperience() {
  const [draft, setDraft] = useState<OnboardingDraft>({});
  const [editingId, setEditingId] = useState<OnboardingStepId | null>(null);
  const [ready, setReady] = useState(false);
  const [persistResult, setPersistResult] = useState<PersistResult | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // localStorage is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resume a saved draft on the client
    setDraft(loadOnboardingDraft());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      saveOnboardingDraft(draft);
    }
  }, [draft, ready]);

  const currentId = editingId ?? firstIncompleteStep(draft);
  const currentIndex =
    currentId === "done"
      ? onboardingStepIds.length
      : onboardingStepIds.indexOf(currentId);
  const progress = Math.round(
    (currentIndex / onboardingStepIds.length) * 100,
  );

  const historyIds = useMemo(() => {
    if (currentId === "done") {
      return [...onboardingStepIds];
    }
    return onboardingStepIds.slice(0, currentIndex);
  }, [currentId, currentIndex]);

  useEffect(() => {
    if (currentId === "done") {
      document.getElementById("onboarding-done")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }
    document.getElementById("onboarding-current")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [currentId]);

  function complete(next: OnboardingDraft) {
    setDraft(next);
    setEditingId(null);
  }

  async function finish() {
    if (!isOnboardingComplete(draft) || saving) {
      return;
    }
    setSaving(true);
    const result = await persistOnboarding(draft);
    setPersistResult(result);
    setSaving(false);
  }

  if (!ready) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <header className="mb-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Onboarding
        </p>
        <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-4xl">
          Let’s get you set up
        </h1>
        <div className="mt-6 h-[3px] overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-accent/80 transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {Math.min(currentIndex + 1, onboardingStepIds.length)} of{" "}
          {onboardingStepIds.length}
        </p>
      </header>

      <div className="flex flex-col gap-7">
        {historyIds.map((id) => (
          <div key={id} className="flex flex-col gap-4">
            <CoachMessage>{questionForStep(id, draft)}</CoachMessage>
            <UserResponse
              label={labelForAnswer(id, draft)}
              onEdit={() => setEditingId(id)}
            />
          </div>
        ))}

        {currentId !== "done" ? (
          <div id="onboarding-current" className="flex flex-col gap-4">
            <CoachMessage>
              {questionForStep(currentId, draft)}
            </CoachMessage>
            <StepControl
              key={currentId}
              id={currentId}
              draft={draft}
              onComplete={complete}
            />
          </div>
        ) : (
          <div id="onboarding-done" className="flex flex-col gap-5">
            <CoachMessage>
              {`Thanks${draft.displayName ? `, ${draft.displayName}` : ""}. I’ve got enough to start coaching you — training, food, sleep, and how you like to be pushed.`}
            </CoachMessage>
            {persistResult ? (
              <p className="pl-10 text-[13px] leading-6 text-muted">
                {persistResult.status === "supabase"
                  ? "Saved to your profile."
                  : "Saved on this device for now. It isn’t linked to an account yet — that happens when sign-in is added."}
              </p>
            ) : (
              <div className="pl-10">
                <button
                  type="button"
                  disabled={saving}
                  className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
                  onClick={() => void finish()}
                >
                  {saving ? "Saving…" : "Save and continue"}
                </button>
              </div>
            )}
            {persistResult ? (
              <div className="pl-10">
                <Link
                  href="/today"
                  className="text-[13px] text-muted hover:text-foreground"
                >
                  Start today
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function StepControl({
  id,
  draft,
  onComplete,
}: {
  id: OnboardingStepId;
  draft: OnboardingDraft;
  onComplete: (draft: OnboardingDraft) => void;
}) {
  switch (id) {
    case "displayName":
      return (
        <TextReply
          label="Your name"
          placeholder="Your first name"
          initialValue={draft.displayName ?? ""}
          onSubmit={(displayName) => onComplete({ ...draft, displayName })}
        />
      );
    case "primaryGoal":
      return (
        <OptionSelector
          name="Primary goal"
          options={primaryGoalOptions}
          value={draft.primaryGoal ?? null}
          onChange={(primaryGoal) => onComplete({ ...draft, primaryGoal })}
        />
      );
    case "goalOwnWords":
      return (
        <TextReply
          label="Your goal in your own words"
          placeholder="e.g. leaner for summer, stronger in the gym"
          initialValue={draft.goalOwnWords ?? ""}
          multiline
          onSubmit={(goalOwnWords) => onComplete({ ...draft, goalOwnWords })}
        />
      );
    case "age":
      return (
        <AgeSlider
          value={draft.age ?? 30}
          onContinue={(age) => onComplete({ ...draft, age })}
        />
      );
    case "sex":
      return (
        <OptionSelector
          name="Sex"
          options={sexOptions}
          value={draft.sex ?? null}
          onChange={(sex) => onComplete({ ...draft, sex })}
        />
      );
    case "height":
      return (
        <MeasureInput
          kind="height"
          value={draft.height ?? defaultHeight}
          onContinue={(height) => onComplete({ ...draft, height })}
        />
      );
    case "weight":
      return (
        <MeasureInput
          kind="weight"
          value={draft.weight ?? defaultWeight}
          onContinue={(weight) => onComplete({ ...draft, weight })}
        />
      );
    case "trainingFrequency":
      return (
        <OptionSelector
          name="Training frequency"
          options={trainingFrequencyOptions}
          value={draft.trainingFrequency ?? null}
          onChange={(trainingFrequency) =>
            onComplete({ ...draft, trainingFrequency })
          }
        />
      );
    case "trainingTypes":
      return (
        <MultiOptionSelector
          name="Training types"
          options={trainingTypeOptions}
          value={draft.trainingTypes ?? []}
          onContinue={(trainingTypes) => onComplete({ ...draft, trainingTypes })}
        />
      );
    case "trainingLocation":
      return (
        <OptionSelector
          name="Training location"
          options={trainingLocationOptions}
          value={draft.trainingLocation ?? null}
          onChange={(trainingLocation) =>
            onComplete({ ...draft, trainingLocation })
          }
        />
      );
    case "equipment":
      return (
        <MultiOptionSelector
          name="Equipment"
          options={equipmentOptions}
          value={draft.equipment ?? []}
          onContinue={(equipment) => onComplete({ ...draft, equipment })}
        />
      );
    case "likesDislikes":
      return (
        <TextReply
          label="Exercises you like or dislike"
          placeholder="e.g. love deadlifts, not keen on burpees"
          initialValue={
            draft.likesDislikes === "None" ? "" : (draft.likesDislikes ?? "")
          }
          multiline
          skipLabel="None"
          onSubmit={(likesDislikes) => onComplete({ ...draft, likesDislikes })}
        />
      );
    case "activityLevel":
      return (
        <OptionSelector
          name="Activity level"
          options={activityLevelOptions}
          value={draft.activityLevel ?? null}
          onChange={(activityLevel) => onComplete({ ...draft, activityLevel })}
        />
      );
    case "typicalSleep":
      return (
        <OptionSelector
          name="Typical sleep"
          options={sleepOptions}
          value={draft.typicalSleep ?? null}
          onChange={(typicalSleep) => onComplete({ ...draft, typicalSleep })}
        />
      );
    case "lifestyleConstraints":
      return (
        <TextReply
          label="Lifestyle or time constraints"
          placeholder="e.g. early meetings, kids, shift work"
          initialValue={
            draft.lifestyleConstraints === "None"
              ? ""
              : (draft.lifestyleConstraints ?? "")
          }
          multiline
          skipLabel="None"
          onSubmit={(lifestyleConstraints) =>
            onComplete({ ...draft, lifestyleConstraints })
          }
        />
      );
    case "dietaryPreferences":
      return (
        <MultiOptionSelector
          name="Dietary preferences"
          options={dietOptions}
          value={draft.dietaryPreferences ?? []}
          onContinue={(dietaryPreferences) =>
            onComplete({ ...draft, dietaryPreferences })
          }
        />
      );
    case "foodsAvoided":
      return (
        <TextReply
          label="Foods you avoid"
          placeholder="e.g. dairy, fried food"
          initialValue={
            draft.foodsAvoided === "None" ? "" : (draft.foodsAvoided ?? "")
          }
          skipLabel="None"
          onSubmit={(foodsAvoided) => onComplete({ ...draft, foodsAvoided })}
        />
      );
    case "allergies":
      return (
        <TextReply
          label="Allergies or intolerances"
          placeholder="e.g. nuts, lactose"
          initialValue={
            draft.allergies === "None" ? "" : (draft.allergies ?? "")
          }
          skipLabel="None"
          onSubmit={(allergies) => onComplete({ ...draft, allergies })}
        />
      );
    case "mealsPerDay":
      return (
        <OptionSelector
          name="Meals per day"
          options={mealsPerDayOptions}
          value={draft.mealsPerDay ? String(draft.mealsPerDay) : null}
          onChange={(optionId) =>
            onComplete({ ...draft, mealsPerDay: Number(optionId) })
          }
        />
      );
    case "nutritionSupport":
      return (
        <OptionSelector
          name="Nutrition support"
          options={nutritionSupportOptions}
          value={draft.nutritionSupport ?? null}
          onChange={(nutritionSupport) =>
            onComplete({ ...draft, nutritionSupport })
          }
        />
      );
    case "coachingStyle":
      return (
        <OptionSelector
          name="Coaching style"
          options={coachingStyleOptions}
          value={draft.coachingStyle ?? null}
          onChange={(coachingStyle) => onComplete({ ...draft, coachingStyle })}
        />
      );
  }
}
