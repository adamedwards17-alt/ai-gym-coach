"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listRecentNutritionEntries,
  saveNutritionEntry,
} from "@/app/actions/nutrition";
import { TextReply } from "@/components/onboarding/TextReply";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import { UserResponse } from "@/components/today/UserResponse";
import {
  formatLoggedDateLabel,
  getLocalLoggedDate,
  isDraftReadyToSave,
  labelForMealType,
  mealTypeFromOption,
  mealTypeOptions,
  type MealTypeOptionId,
  type NutritionEntryDraft,
  type NutritionEntryRecord,
} from "@/lib/nutrition";

type Step = "description" | "mealType" | "done";

const emptyDraft: NutritionEntryDraft = {
  description: null,
  mealType: null,
  mealTypeSkipped: false,
};

export function NutritionLogExperience() {
  const [draft, setDraft] = useState<NutritionEntryDraft>(emptyDraft);
  const [editing, setEditing] = useState<Step | null>(null);
  const [entries, setEntries] = useState<NutritionEntryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [composerKey, setComposerKey] = useState(0);

  const today = getLocalLoggedDate();

  const step: Step = useMemo(() => {
    if (editing) {
      return editing;
    }
    if (!draft.description) {
      return "description";
    }
    if (!draft.mealTypeSkipped && draft.mealType === null) {
      return "mealType";
    }
    return "done";
  }, [draft, editing]);

  const todaysEntries = useMemo(
    () => entries.filter((entry) => entry.logged_date === today),
    [entries, today],
  );

  const earlierEntries = useMemo(
    () => entries.filter((entry) => entry.logged_date !== today),
    [entries, today],
  );

  useEffect(() => {
    let cancelled = false;

    void listRecentNutritionEntries().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setEntries(result.entries);
        setLoadError(null);
      } else {
        setLoadError(result.message);
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!isDraftReadyToSave(draft) || !draft.description || saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    const result = await saveNutritionEntry({
      loggedDate: getLocalLoggedDate(),
      description: draft.description,
      mealType: draft.mealTypeSkipped ? null : draft.mealType,
    });

    if (result.status !== "saved") {
      setSaveError(result.message);
      setSaving(false);
      return;
    }

    const refreshed = await listRecentNutritionEntries();
    if (refreshed.status === "ok") {
      setEntries(refreshed.entries);
      setLoadError(null);
    }

    setDraft(emptyDraft);
    setEditing(null);
    setJustSaved(true);
    setSaving(false);
  }

  function startAgain() {
    setDraft(emptyDraft);
    setEditing(null);
    setSaveError(null);
    setJustSaved(false);
    setSaving(false);
    setComposerKey((key) => key + 1);
  }

  function beginEdit() {
    setJustSaved(false);
    setSaveError(null);
    setSaving(false);
  }

  function editDescription() {
    beginEdit();
    setDraft(emptyDraft);
    setEditing(null);
  }

  function editMealType() {
    beginEdit();
    setDraft((current) => ({
      ...current,
      mealType: null,
      mealTypeSkipped: false,
    }));
    setEditing("mealType");
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
          Nutrition
        </p>
        <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-5xl">
          What have you eaten?
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-muted">
          Tell me what you’ve had today.
        </p>
      </header>

      {loadError ? (
        <p role="alert" className="mb-6 text-[13px] leading-6 text-muted">
          {loadError}
        </p>
      ) : null}

      <div className="flex flex-col gap-7">
        {justSaved && !saving ? (
          <div className="flex flex-col gap-4">
            <CoachMessage>Logged. Keep telling me as you eat.</CoachMessage>
            <div className="pl-10">
              <button
                type="button"
                className="inline-flex h-11 w-fit items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
                onClick={startAgain}
              >
                + Log another
              </button>
            </div>
          </div>
        ) : (
          <>
            <CoachMessage>What have you eaten?</CoachMessage>
            {draft.description && step !== "description" ? (
              <UserResponse
                label={draft.description}
                onEdit={editDescription}
              />
            ) : (
              <TextReply
                key={composerKey}
                label="What you’ve eaten"
                placeholder="e.g. Eggs and toast"
                initialValue=""
                onSubmit={(description) => {
                  beginEdit();
                  setDraft({
                    description,
                    mealType: null,
                    mealTypeSkipped: false,
                  });
                  setEditing(null);
                }}
              />
            )}

            {draft.description ? (
              <>
                <CoachMessage id="nutrition-q-meal">
                  Was that breakfast, lunch, or something else? You can skip
                  this.
                </CoachMessage>
                {(draft.mealTypeSkipped || draft.mealType !== null) &&
                step !== "mealType" ? (
                  <UserResponse
                    label={
                      draft.mealTypeSkipped
                        ? "Skipped"
                        : labelForMealType(draft.mealType)
                    }
                    onEdit={editMealType}
                  />
                ) : (
                  <OptionSelector
                    name="Meal type"
                    options={mealTypeOptions}
                    value={
                      draft.mealTypeSkipped ? "skip" : draft.mealType
                    }
                    onChange={(optionId: MealTypeOptionId) => {
                      beginEdit();
                      setDraft((current) => ({
                        ...current,
                        mealTypeSkipped: optionId === "skip",
                        mealType: mealTypeFromOption(optionId),
                      }));
                      setEditing(null);
                    }}
                  />
                )}
              </>
            ) : null}

            {step === "done" ? (
              <div className="flex flex-col gap-3 pl-10">
                {saveError ? (
                  <p
                    role="alert"
                    className="text-[13px] leading-6 text-muted"
                  >
                    {saveError}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  className="inline-flex h-11 w-fit items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving…" : saveError ? "Try again" : "Save"}
                </button>
              </div>
            ) : null}
          </>
        )}

        {todaysEntries.length > 0 ? (
          <section className="mt-4 border-t border-border/70 pt-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Today
            </p>
            <ul className="mt-5 flex flex-col gap-4">
              {todaysEntries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1">
                  <p className="text-[14px] text-foreground">
                    {entry.description}
                  </p>
                  <p className="text-[12px] leading-5 text-muted">
                    {entry.meal_type
                      ? labelForMealType(entry.meal_type)
                      : "Logged"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {earlierEntries.length > 0 ? (
          <section
            className={
              todaysEntries.length > 0
                ? "pt-2"
                : "mt-4 border-t border-border/70 pt-8"
            }
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Recent
            </p>
            <ul className="mt-5 flex flex-col gap-4">
              {earlierEntries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1">
                  <p className="text-[14px] text-foreground">
                    {entry.description}
                  </p>
                  <p className="text-[12px] leading-5 text-muted">
                    {formatLoggedDateLabel(entry.logged_date)}
                    {entry.meal_type
                      ? ` · ${labelForMealType(entry.meal_type)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
