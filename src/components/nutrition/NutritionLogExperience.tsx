"use client";

import { useEffect, useMemo, useState } from "react";
import {
  deleteNutritionEntry,
  estimateNutritionFood,
  loadNutritionDay,
  markNutritionEntryEaten,
  saveNutritionEntry,
  updateNutritionEntry,
} from "@/app/actions/nutrition";
import { NutritionConfirmDialog } from "@/components/nutrition/NutritionConfirmDialog";
import { NutritionDaySummaryCard } from "@/components/nutrition/NutritionDaySummary";
import { NutritionDescriptionInput } from "@/components/nutrition/NutritionDescriptionInput";
import { NutritionEditSheet } from "@/components/nutrition/NutritionEditSheet";
import {
  NutritionRecentFoodEditor,
  type RecentFoodLogValues,
} from "@/components/nutrition/NutritionRecentFoodEditor";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import { UserResponse } from "@/components/today/UserResponse";
import {
  estimateFromEntry,
  formatEntryNutritionLine,
  formatEstimateSummary,
  formatLoggedDateLabel,
  getLocalLoggedDate,
  isDraftReadyToEstimate,
  labelForMealType,
  mealTypeFromOption,
  mealTypeOptions,
  nutritionStatusOptions,
  type MealTypeId,
  type MealTypeOptionId,
  type NutritionDaySummary,
  type NutritionEntryDraft,
  type NutritionEntryRecord,
  type NutritionEntryStatus,
  type NutritionEstimate,
} from "@/lib/nutrition";

type Step =
  | "description"
  | "mealType"
  | "status"
  | "clarify"
  | "confirm"
  | "done";

const emptyDraft: NutritionEntryDraft = {
  description: null,
  mealType: null,
  mealTypeSkipped: false,
  status: "eaten",
};

export function NutritionLogExperience({
  initialMealType = null,
}: {
  initialMealType?: MealTypeId | null;
}) {
  const [draft, setDraft] = useState<NutritionEntryDraft>(() =>
    initialMealType
      ? { ...emptyDraft, mealType: initialMealType, mealTypeSkipped: false }
      : emptyDraft,
  );
  const [editing, setEditing] = useState<Step | null>(null);
  const [estimate, setEstimate] = useState<NutritionEstimate | null>(null);
  const [pendingEstimate, setPendingEstimate] =
    useState<NutritionEstimate | null>(null);
  const [clarificationQuestion, setClarificationQuestion] = useState<
    string | null
  >(null);
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const [recentFood, setRecentFood] = useState<{
    entry: NutritionEntryRecord;
    estimate: NutritionEstimate;
  } | null>(null);
  const [summary, setSummary] = useState<NutritionDaySummary | null>(null);
  const [entries, setEntries] = useState<NutritionEntryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [editEntry, setEditEntry] = useState<NutritionEntryRecord | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

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
    if (clarificationQuestion) {
      return "clarify";
    }
    if (!estimate && !estimating) {
      return "status";
    }
    if (estimate) {
      return "confirm";
    }
    return "done";
  }, [draft, editing, estimate, estimating, clarificationQuestion]);

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

  async function runEstimate(
    description: string,
    options?: {
      clarificationAnswer?: string | null;
      skipClarification?: boolean;
    },
  ) {
    setEstimating(true);
    setSaveError(null);
    setEstimate(null);
    setClarificationQuestion(null);

    const result = await estimateNutritionFood({
      description,
      clarificationAnswer: options?.clarificationAnswer,
      skipClarification: options?.skipClarification,
    });
    setEstimating(false);

    if (result.status === "needs_clarification") {
      setClarificationQuestion(result.question);
      setEditing("clarify");
      return;
    }

    if (result.status !== "ok") {
      setSaveError(result.message);
      setEditing("status");
      return;
    }

    setEstimate(result.estimate);
    setClarificationAnswer("");
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
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setFromSuggestion(false);
    setRecentFood(null);
    setEditing(null);
    setJustSaved(true);
    setSaving(false);
  }

  function startAgain() {
    setDraft(emptyDraft);
    setEstimate(null);
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setClarificationAnswer("");
    setFromSuggestion(false);
    setRecentFood(null);
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

  function resetDescriptionFlow() {
    beginEdit();
    setEstimate(null);
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setClarificationAnswer("");
    setFromSuggestion(false);
    setRecentFood(null);
    setDraft(emptyDraft);
    setEditing(null);
    setComposerKey((key) => key + 1);
  }

  function applySuggestion(entry: NutritionEntryRecord) {
    beginEdit();
    const reused = estimateFromEntry(entry);

    // Existing foods with saved macros → structured editor (not conversational).
    if (reused) {
      setRecentFood({ entry, estimate: reused });
      setDraft(emptyDraft);
      setEstimate(null);
      setPendingEstimate(null);
      setClarificationQuestion(null);
      setFromSuggestion(false);
      setEditing(null);
      return;
    }

    // Recent food without macros → fall back to new-food conversational flow.
    setRecentFood(null);
    setDraft({
      description: entry.description,
      mealType: entry.meal_type,
      mealTypeSkipped: entry.meal_type == null,
      status: "eaten",
    });
    setEstimate(null);
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setFromSuggestion(false);
    setEditing(entry.meal_type == null ? "mealType" : null);
  }

  async function handleRecentFoodLog(values: RecentFoodLogValues) {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    const result = await saveNutritionEntry({
      loggedDate: getLocalLoggedDate(),
      description: values.description,
      mealType: values.mealType,
      status: values.status,
      estimate: values.estimate,
    });

    if (result.status !== "saved") {
      setSaveError(result.message);
      setSaving(false);
      return;
    }

    await refreshDay();
    setRecentFood(null);
    setDraft(emptyDraft);
    setEstimate(null);
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setFromSuggestion(false);
    setEditing(null);
    setJustSaved(true);
    setSaving(false);
    setComposerKey((key) => key + 1);
  }

  function editMealType() {
    beginEdit();
    if (!fromSuggestion) {
      setEstimate(null);
      setPendingEstimate(null);
    } else {
      setEstimate(null);
    }
    setClarificationQuestion(null);
    setDraft((current) => ({
      ...current,
      mealType: null,
      mealTypeSkipped: false,
    }));
    setEditing("mealType");
  }

  function editStatus() {
    beginEdit();
    if (!fromSuggestion) {
      setEstimate(null);
      setPendingEstimate(null);
    } else {
      setEstimate(null);
    }
    setClarificationQuestion(null);
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

  async function handleConfirmDelete() {
    if (!deleteEntryId) {
      return;
    }
    setDeletePending(true);
    const result = await deleteNutritionEntry({ entryId: deleteEntryId });
    setDeletePending(false);
    if (result.status === "deleted") {
      setDeleteEntryId(null);
      await refreshDay();
    } else {
      setLoadError(result.message);
    }
  }

  async function handleSaveEdit(values: {
    description: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) {
    if (!editEntry) {
      return;
    }
    setEditSaving(true);
    setEditError(null);
    const result = await updateNutritionEntry({
      entryId: editEntry.id,
      ...values,
    });
    setEditSaving(false);
    if (result.status !== "updated") {
      setEditError(result.message);
      return;
    }
    setEditEntry(null);
    await refreshDay();
  }

  function renderEntryActions(entry: NutritionEntryRecord) {
    return (
      <div className="mt-1 flex flex-wrap gap-3">
        <button
          type="button"
          className="text-[12px] text-muted transition-colors hover:text-foreground"
          onClick={() => {
            setEditError(null);
            setEditEntry(entry);
          }}
        >
          Edit
        </button>
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
          onClick={() => setDeleteEntryId(entry.id)}
        >
          Remove
        </button>
      </div>
    );
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
        ) : recentFood ? (
          <NutritionRecentFoodEditor
            key={`${recentFood.entry.id}-${composerKey}`}
            entry={recentFood.entry}
            baseEstimate={recentFood.estimate}
            initialMealType={initialMealType}
            saving={saving}
            error={saveError}
            onCancel={resetDescriptionFlow}
            onLog={(values) => void handleRecentFoodLog(values)}
          />
        ) : (
          <>
            <CoachMessage>What have you eaten?</CoachMessage>
            {draft.description && step !== "description" ? (
              <UserResponse
                label={draft.description}
                onEdit={resetDescriptionFlow}
              />
            ) : (
              <NutritionDescriptionInput
                key={composerKey}
                label="What you’ve eaten"
                placeholder="e.g. Eggs and toast"
                onSubmit={(description) => {
                  beginEdit();
                  setRecentFood(null);
                  setDraft({
                    description,
                    mealType: null,
                    mealTypeSkipped: false,
                    status: "eaten",
                  });
                  setEstimate(null);
                  setPendingEstimate(null);
                  setClarificationQuestion(null);
                  setFromSuggestion(false);
                  setEditing(null);
                }}
                onSelectSuggestion={applySuggestion}
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
                      if (!fromSuggestion) {
                        setEstimate(null);
                        setPendingEstimate(null);
                        setClarificationQuestion(null);
                      } else {
                        setEstimate(null);
                      }
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
                {(estimate ||
                  estimating ||
                  clarificationQuestion ||
                  step === "confirm" ||
                  step === "clarify") &&
                step !== "status" ? (
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
                      setEditing(null);
                      if (fromSuggestion && pendingEstimate) {
                        setEstimate(pendingEstimate);
                        return;
                      }
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

            {clarificationQuestion && !estimating ? (
              <div className="flex flex-col gap-4">
                <CoachMessage>{clarificationQuestion}</CoachMessage>
                <form
                  className="pl-10"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!draft.description) {
                      return;
                    }
                    void runEstimate(draft.description, {
                      clarificationAnswer: clarificationAnswer,
                    });
                  }}
                >
                  <input
                    aria-label="Clarification answer"
                    value={clarificationAnswer}
                    onChange={(event) =>
                      setClarificationAnswer(event.target.value)
                    }
                    placeholder="e.g. 2 eggs and 2 slices"
                    className="h-12 w-full rounded-full border border-border bg-surface/60 px-4 text-[15px] text-foreground outline-none placeholder:text-muted focus:border-white/20"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
                    >
                      Continue
                    </button>
                    <button
                      type="button"
                      className="text-sm text-muted hover:text-foreground"
                      onClick={() => {
                        if (!draft.description) {
                          return;
                        }
                        void runEstimate(draft.description, {
                          skipClarification: true,
                        });
                      }}
                    >
                      Skip
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {estimate && !estimating && !clarificationQuestion ? (
              <div className="flex flex-col gap-4">
                <CoachMessage>
                  {`${draft.description ?? "That meal"}\n\n${formatEstimateSummary(estimate)}\n\n${
                    estimate.source === "user"
                      ? "Using your saved values."
                      : fromSuggestion
                        ? "Reused from a recent meal."
                        : estimate.confidence === "low"
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
                  {!fromSuggestion ? (
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
                  ) : null}
                  <button
                    type="button"
                    disabled={saving}
                    className="text-[13px] text-muted transition-colors hover:text-foreground"
                    onClick={resetDescriptionFlow}
                  >
                    Edit description
                  </button>
                </div>
              </div>
            ) : null}

            {saveError && !estimate && !estimating && !clarificationQuestion ? (
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
                      {formatEntryNutritionLine(entry)
                        ? ` · ${formatEntryNutritionLine(entry)}`
                        : ""}
                    </p>
                    {renderEntryActions(entry)}
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
                    {formatEntryNutritionLine(entry)
                      ? ` · ${formatEntryNutritionLine(entry)}`
                      : ""}
                  </p>
                  {renderEntryActions(entry)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {editEntry ? (
        <NutritionEditSheet
          entry={editEntry}
          saving={editSaving}
          error={editError}
          onCancel={() => {
            setEditEntry(null);
            setEditError(null);
          }}
          onSave={(values) => void handleSaveEdit(values)}
        />
      ) : null}

      {deleteEntryId ? (
        <NutritionConfirmDialog
          title="Remove this entry?"
          body="This will update today’s nutrition totals."
          confirmLabel="Remove"
          pending={deletePending}
          onCancel={() => setDeleteEntryId(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </div>
  );
}
