"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteNutritionEntry,
  estimateNutritionFood,
  loadNutritionDay,
  markNutritionEntryEaten,
  saveNutritionEntry,
} from "@/app/actions/nutrition";
import { NutritionDaySummaryCard } from "@/components/nutrition/NutritionDaySummary";
import { TextReply } from "@/components/onboarding/TextReply";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import { UserResponse } from "@/components/today/UserResponse";
import {
  formatEstimateSummary,
  formatLoggedDateLabel,
  getLocalLoggedDate,
  isDraftReadyToEstimate,
  labelForMealType,
  mealTypeFromOption,
  mealTypeOptions,
  nutritionStatusOptions,
  type MealTypeOptionId,
  type NutritionDaySummary,
  type NutritionEntryDraft,
  type NutritionEntryRecord,
  type NutritionEntryStatus,
  type NutritionEstimate,
} from "@/lib/nutrition";

type Step = "description" | "mealType" | "status" | "confirm" | "done";

const emptyDraft: NutritionEntryDraft = {
  description: null,
  mealType: null,
  mealTypeSkipped: false,
  status: "eaten",
};

function entryMacroLine(entry: NutritionEntryRecord): string | null {
  if (entry.calories_estimated == null) {
    return null;
  }
  const protein = entry.protein_g_estimated ?? 0;
  const carbs = entry.carbs_g_estimated ?? 0;
  const fat = entry.fat_g_estimated ?? 0;
  const confidence =
    entry.estimation_confidence === "low"
      ? " · rough estimate"
      : entry.estimation_confidence === "medium"
        ? " · estimated"
        : " · estimated";
  return `~${entry.calories_estimated} kcal · ${protein}g P · ${carbs}g C · ${fat}g F${confidence}`;
}

export function NutritionLogExperience() {
  const [draft, setDraft] = useState<NutritionEntryDraft>(emptyDraft);
  const [editing, setEditing] = useState<Step | null>(null);
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [summary, setSummary] = useState<NutritionDaySummary | null>(null);
  const [entries, setEntries] = useState<NutritionEntryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [estimating, setEstimating] = useState(false);
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
    if (!estimate && !estimating) {
      return "status";
    }
    if (estimate) {
      return "confirm";
    }
    return "done";
  }, [draft, editing, estimate, estimating]);

  const earlierEntries = useMemo(
    () => entries.filter((entry) => entry.logged_date !== today),
    [entries, today],
  );

  async function refreshDay() {
    const result = await loadNutritionDay(getLocalLoggedDate());
    if (result.status === "ok") {
      setSummary(result.summary);
      setEntries(result.recent);
      setLoadError(null);
      return true;
    }
    setLoadError(result.message);
    return false;
  }

  useEffect(() => {
    let cancelled = false;

    void loadNutritionDay(getLocalLoggedDate()).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setSummary(result.summary);
        setEntries(result.recent);
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

  async function runEstimate(description: string) {
    setEstimating(true);
    setSaveError(null);
    setEstimate(null);

    const result = await estimateNutritionFood({ description });
    setEstimating(false);

    if (result.status !== "ok") {
      setSaveError(result.message);
      setEditing("status");
      return;
    }

    setEstimate(result.estimate);
    setEditing(null);
  }

  async function handleConfirmSave() {
    if (
      !isDraftReadyToEstimate(draft) ||
      !draft.description ||
      !estimate ||
      saving
    ) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    const result = await saveNutritionEntry({
      loggedDate: getLocalLoggedDate(),
      description: draft.description,
      mealType: draft.mealTypeSkipped ? null : draft.mealType,
      status: draft.status,
      estimate,
    });

    if (result.status !== "saved") {
      setSaveError(result.message);
      setSaving(false);
      return;
    }

    await refreshDay();
    setDraft(emptyDraft);
    setEstimate(null);
    setEditing(null);
    setJustSaved(true);
    setSaving(false);
  }

  function startAgain() {
    setDraft(emptyDraft);
    setEstimate(null);
    setEditing(null);
    setSaveError(null);
    setJustSaved(false);
    setSaving(false);
    setEstimating(false);
    setComposerKey((key) => key + 1);
  }

  function beginEdit() {
    setJustSaved(false);
    setSaveError(null);
    setSaving(false);
  }

  function editDescription() {
    beginEdit();
    setEstimate(null);
    setDraft(emptyDraft);
    setEditing(null);
    setComposerKey((key) => key + 1);
  }

  function editMealType() {
    beginEdit();
    setEstimate(null);
    setDraft((current) => ({
      ...current,
      mealType: null,
      mealTypeSkipped: false,
    }));
    setEditing("mealType");
  }

  function editStatus() {
    beginEdit();
    setEstimate(null);
    setEditing("status");
  }

  async function handleMarkEaten(entryId: string) {
    const result = await markNutritionEntryEaten({ entryId });
    if (result.status === "updated") {
      await refreshDay();
    } else {
      setLoadError(result.message);
    }
  }

  async function handleDelete(entryId: string) {
    const result = await deleteNutritionEntry({ entryId });
    if (result.status === "deleted") {
      await refreshDay();
    } else {
      setLoadError(result.message);
    }
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
      <header className="mb-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Nutrition
        </p>
        <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-5xl">
          What have you eaten?
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-muted">
          Tell me what you’ve had — or what’s planned — and I’ll estimate it.
        </p>
      </header>

      {summary ? <NutritionDaySummaryCard summary={summary} /> : null}

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
                    status: "eaten",
                  });
                  setEstimate(null);
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
                      setEstimate(null);
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

            {draft.description &&
            (draft.mealTypeSkipped || draft.mealType !== null) ? (
              <>
                <CoachMessage id="nutrition-q-status">
                  Have you already eaten this, or is it planned?
                </CoachMessage>
                {estimate || estimating || step === "confirm" ? (
                  <UserResponse
                    label={
                      draft.status === "planned"
                        ? "Planned"
                        : "Already eaten"
                    }
                    onEdit={editStatus}
                  />
                ) : (
                  <OptionSelector
                    name="Eaten or planned"
                    options={nutritionStatusOptions}
                    value={draft.status}
                    onChange={(status: NutritionEntryStatus) => {
                      beginEdit();
                      const description = draft.description;
                      setDraft((current) => ({ ...current, status }));
                      if (description) {
                        void runEstimate(description);
                      }
                    }}
                  />
                )}
              </>
            ) : null}

            {estimating ? (
              <CoachMessage footnote="Estimating…">
                Working out the nutrition for that…
              </CoachMessage>
            ) : null}

            {estimate && !estimating ? (
              <div className="flex flex-col gap-4">
                <CoachMessage>
                  {`${draft.description ?? "That meal"}\n\n${formatEstimateSummary(estimate)}\n\n${
                    estimate.confidence === "low"
                      ? "This is a rough estimate from your description."
                      : "Estimated from your description."
                  }`}
                </CoachMessage>
                <div className="flex flex-wrap gap-3 pl-10">
                  {saveError ? (
                    <p role="alert" className="w-full text-[13px] text-muted">
                      {saveError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    disabled={saving}
                    className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
                    onClick={() => void handleConfirmSave()}
                  >
                    {saving
                      ? "Saving…"
                      : draft.status === "planned"
                        ? "Save planned"
                        : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={saving || estimating}
                    className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60"
                    onClick={() => {
                      if (draft.description) {
                        void runEstimate(draft.description);
                      }
                    }}
                  >
                    Re-estimate
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="text-[13px] text-muted transition-colors hover:text-foreground"
                    onClick={editDescription}
                  >
                    Edit description
                  </button>
                </div>
              </div>
            ) : null}

            {saveError && !estimate && !estimating ? (
              <p role="alert" className="pl-10 text-[13px] text-muted">
                {saveError}
              </p>
            ) : null}
          </>
        )}

        {summary &&
        (summary.eatenEntries.length > 0 ||
          summary.plannedEntries.length > 0) ? (
          <section className="mt-4 border-t border-border/70 pt-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Today
            </p>
            <ul className="mt-5 flex flex-col gap-5">
              {[...summary.plannedEntries, ...summary.eatenEntries].map(
                (entry) => (
                  <li key={entry.id} className="flex flex-col gap-1">
                    <p className="text-[14px] text-foreground">
                      {entry.description}
                    </p>
                    <p className="text-[12px] leading-5 text-muted">
                      {entry.status === "planned" ? "Planned" : "Eaten"}
                      {entry.meal_type
                        ? ` · ${labelForMealType(entry.meal_type)}`
                        : ""}
                      {entryMacroLine(entry)
                        ? ` · ${entryMacroLine(entry)}`
                        : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {entry.status === "planned" ? (
                        <button
                          type="button"
                          className="text-[12px] text-muted transition-colors hover:text-foreground"
                          onClick={() => void handleMarkEaten(entry.id)}
                        >
                          Mark eaten
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-[12px] text-muted transition-colors hover:text-foreground"
                        onClick={() => void handleDelete(entry.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </section>
        ) : null}

        {earlierEntries.length > 0 ? (
          <section
            className={
              summary &&
              (summary.eatenEntries.length > 0 ||
                summary.plannedEntries.length > 0)
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
                    {entry.status === "planned" ? " · Planned" : ""}
                    {entry.meal_type
                      ? ` · ${labelForMealType(entry.meal_type)}`
                      : ""}
                    {entryMacroLine(entry)
                      ? ` · ${entryMacroLine(entry)}`
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
