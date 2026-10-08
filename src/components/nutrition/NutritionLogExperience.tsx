"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { startMealInspirationChat } from "@/app/actions/coach";
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
import { getLocalCoachDate } from "@/lib/coach";
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

const PRIMARY_MEALS = ["breakfast", "lunch", "snack", "dinner"] as const;

type PrimaryMealId = (typeof PRIMARY_MEALS)[number];

function formatNutritionDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function nextMealOpportunity(
  logged: Array<MealTypeId | null>,
  hour: number,
): PrimaryMealId | null {
  const has = (meal: PrimaryMealId) => logged.includes(meal);

  if (!has("breakfast") && hour < 14) {
    return "breakfast";
  }
  if (!has("lunch") && hour >= 10 && hour < 17) {
    return "lunch";
  }
  if (has("lunch") && !has("snack") && hour >= 14 && hour < 18) {
    return "snack";
  }
  if (!has("dinner") && hour >= 15) {
    return "dinner";
  }
  if (!has("breakfast")) {
    return "breakfast";
  }
  if (!has("lunch")) {
    return "lunch";
  }
  if (!has("dinner")) {
    return "dinner";
  }
  return null;
}

function mealSectionLabel(meal: PrimaryMealId | "other"): string {
  if (meal === "other") {
    return "Other";
  }
  return labelForMealType(meal);
}

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
  const router = useRouter();
  const [loggingOpen, setLoggingOpen] = useState(() => initialMealType != null);
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
  const [inspirationError, setInspirationError] = useState<string | null>(null);
  const [inspirationPending, startInspiration] = useTransition();

  const today = getLocalLoggedDate();
  const hour = new Date().getHours();

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

  const todayEntries = useMemo(() => {
    if (!summary) {
      return [] as NutritionEntryRecord[];
    }
    return [...summary.plannedEntries, ...summary.eatenEntries];
  }, [summary]);

  const loggedMealTypes = useMemo(
    () => todayEntries.map((entry) => entry.meal_type),
    [todayEntries],
  );

  const mealGroups = useMemo(() => {
    const groups: Record<PrimaryMealId | "other", NutritionEntryRecord[]> = {
      breakfast: [],
      lunch: [],
      snack: [],
      dinner: [],
      other: [],
    };

    for (const entry of todayEntries) {
      if (
        entry.meal_type === "breakfast" ||
        entry.meal_type === "lunch" ||
        entry.meal_type === "snack" ||
        entry.meal_type === "dinner"
      ) {
        groups[entry.meal_type].push(entry);
      } else {
        groups.other.push(entry);
      }
    }

    return groups;
  }, [todayEntries]);

  const nextMeal = useMemo(
    () => nextMealOpportunity(loggedMealTypes, hour),
    [loggedMealTypes, hour],
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
    setLoggingOpen(false);
    setSaving(false);
  }

  function openLogging(mealType: MealTypeId | null = null) {
    setDraft(
      mealType
        ? { ...emptyDraft, mealType, mealTypeSkipped: false }
        : emptyDraft,
    );
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
    setLoggingOpen(true);
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
    setLoggingOpen(false);
  }

  function handleAskCoach() {
    setInspirationError(null);
    startInspiration(async () => {
      const result = await startMealInspirationChat({
        localDate: getLocalCoachDate(),
      });
      if (result.status !== "created") {
        setInspirationError(result.message);
        return;
      }
      router.push(`/coach/${result.conversation.id}`);
    });
  }

  function applySuggestion(entry: NutritionEntryRecord) {
    beginEdit();
    setLoggingOpen(true);
    const reused = estimateFromEntry(entry);

    // Existing foods with saved macros → structured editor (not conversational).
    if (reused) {
      setJustSaved(false);
      setRecentFood({ entry, estimate: reused });
      setDraft(emptyDraft);
      setEstimate(null);
      setPendingEstimate(null);
      setClarificationQuestion(null);
      setClarificationAnswer("");
      setFromSuggestion(false);
      setEditing(null);
      setSaveError(null);
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
    setLoggingOpen(false);
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

  function renderEntryRow(entry: NutritionEntryRecord) {
    const nutritionLine = formatEntryNutritionLine(entry);
    return (
      <li key={entry.id} className="flex flex-col gap-1 py-3">
        <p className="text-[15px] text-foreground">{entry.description}</p>
        <p className="text-[12px] leading-5 text-muted">
          {entry.status === "planned" ? "Planned" : "Eaten"}
          {nutritionLine ? ` · ${nutritionLine}` : ""}
        </p>
        {renderEntryActions(entry)}
      </li>
    );
  }

  if (!ready) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">
        Loading…
      </p>
    );
  }

  const loggingActive =
    loggingOpen || recentFood != null || Boolean(draft.description);

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <header className="mb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Nutrition
        </p>
        <h1 className="mt-2 font-serif text-[1.85rem] leading-tight tracking-tight sm:text-4xl">
          {formatNutritionDate(today)}
        </h1>
      </header>

      {loadError ? (
        <p role="alert" className="mb-4 text-[13px] leading-6 text-muted">
          {loadError}
        </p>
      ) : null}

      {loggingActive ? (
        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">Logging food</p>
          <button
            type="button"
            onClick={resetDescriptionFlow}
            className="text-[13px] text-muted transition-colors hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => openLogging(null)}
            className="mb-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[15px] font-medium text-background"
          >
            + Add meal
          </button>

          {justSaved ? (
            <p className="mb-4 text-[13px] text-muted">Logged. Nice one.</p>
          ) : null}

          {summary ? <NutritionDaySummaryCard summary={summary} /> : null}
        </>
      )}

      {loggingActive ? (
        <div className="flex flex-col gap-7">
          {recentFood ? (
            <NutritionRecentFoodEditor
              key={`${recentFood.entry.id}-${composerKey}`}
              entry={recentFood.entry}
              baseEstimate={recentFood.estimate}
              initialMealType={initialMealType ?? draft.mealType}
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
                  onEdit={() => {
                    beginEdit();
                    setEstimate(null);
                    setPendingEstimate(null);
                    setClarificationQuestion(null);
                    setClarificationAnswer("");
                    setFromSuggestion(false);
                    setRecentFood(null);
                    setDraft((current) => ({
                      ...current,
                      description: null,
                      mealType: current.mealType,
                      mealTypeSkipped: current.mealTypeSkipped,
                    }));
                    setEditing(null);
                    setComposerKey((key) => key + 1);
                  }}
                />
              ) : (
                <NutritionDescriptionInput
                  key={composerKey}
                  label="What you’ve eaten"
                  placeholder="e.g. Eggs and toast"
                  onSubmit={(description) => {
                    beginEdit();
                    setRecentFood(null);
                    setDraft((current) => ({
                      ...current,
                      description,
                      mealType: current.mealType,
                      mealTypeSkipped: current.mealTypeSkipped,
                      status: current.status,
                    }));
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
                      onClick={() => {
                        beginEdit();
                        setEstimate(null);
                        setPendingEstimate(null);
                        setClarificationQuestion(null);
                        setDraft((current) => ({
                          ...current,
                          description: null,
                        }));
                        setComposerKey((key) => key + 1);
                      }}
                    >
                      Edit description
                    </button>
                  </div>
                </div>
              ) : null}

              {saveError &&
              !estimate &&
              !estimating &&
              !clarificationQuestion ? (
                <p role="alert" className="pl-10 text-[13px] text-muted">
                  {saveError}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Today
            </p>

            <div className="mt-4 flex flex-col gap-6">
              {PRIMARY_MEALS.map((meal) => {
                const items = mealGroups[meal];
                const showEmptyPrompt = nextMeal === meal && items.length === 0;
                if (items.length === 0 && !showEmptyPrompt) {
                  return null;
                }

                return (
                  <div key={meal}>
                    <h2 className="text-[15px] font-medium text-foreground">
                      {mealSectionLabel(meal)}
                    </h2>
                    {items.length > 0 ? (
                      <ul className="mt-1 divide-y divide-border/60">
                        {items.map((entry) => renderEntryRow(entry))}
                      </ul>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openLogging(meal)}
                        className="mt-2 text-[14px] text-foreground/90 underline-offset-4 hover:underline"
                      >
                        + Add {mealSectionLabel(meal).toLowerCase()}
                      </button>
                    )}
                  </div>
                );
              })}

              {mealGroups.other.length > 0 ? (
                <div>
                  <h2 className="text-[15px] font-medium text-foreground">
                    Other
                  </h2>
                  <ul className="mt-1 divide-y divide-border/60">
                    {mealGroups.other.map((entry) => renderEntryRow(entry))}
                  </ul>
                </div>
              ) : null}

              {todayEntries.length === 0 && !nextMeal ? (
                <p className="text-[14px] leading-6 text-muted">
                  Nothing logged yet today.
                </p>
              ) : null}
            </div>
          </section>

          {earlierEntries.length > 0 ? (
            <section className="border-t border-border/70 pt-6">
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
                Recent
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {earlierEntries.slice(0, 6).map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1">
                    <p className="text-[14px] text-foreground">
                      {entry.description}
                    </p>
                    <p className="text-[12px] leading-5 text-muted">
                      {formatLoggedDateLabel(entry.logged_date)}
                      {entry.meal_type
                        ? ` · ${labelForMealType(entry.meal_type)}`
                        : ""}
                      {formatEntryNutritionLine(entry)
                        ? ` · ${formatEntryNutritionLine(entry)}`
                        : ""}
                    </p>
                    <button
                      type="button"
                      className="w-fit text-[12px] text-muted transition-colors hover:text-foreground"
                      onClick={() => applySuggestion(entry)}
                    >
                      Log again
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="border-t border-border/70 pt-6">
            <p className="text-[15px] font-medium text-foreground">
              Need help deciding what to eat?
            </p>
            <p className="mt-2 text-[13px] leading-6 text-muted">
              Your Coach can suggest something based on what you’ve eaten today
              and what’s left.
            </p>
            <button
              type="button"
              disabled={inspirationPending}
              onClick={handleAskCoach}
              className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[13px] text-foreground transition-colors hover:border-white/16 hover:bg-white/[0.04] disabled:opacity-60"
            >
              {inspirationPending ? "Opening…" : "Ask Coach"}
            </button>
            {inspirationError ? (
              <p role="alert" className="mt-3 text-[13px] text-muted">
                {inspirationError}
              </p>
            ) : null}
          </section>
        </div>
      )}

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
