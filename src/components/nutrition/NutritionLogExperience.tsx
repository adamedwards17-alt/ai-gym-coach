"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { startMealInspirationChat } from "@/app/actions/coach";
import {
  deleteNutritionEntry,
  estimateNutritionFood,
  listRecentNutritionEntries,
  loadNutritionDay,
  markNutritionEntryEaten,
  saveMealDraftEntry,
  saveNutritionEntry,
  updateNutritionEntry,
} from "@/app/actions/nutrition";
import { copyNutritionEntriesToDate } from "@/app/actions/nutrition-quick-log";
import { BarcodeScanPanel } from "@/components/nutrition/BarcodeScanPanel";
import { ManualNutritionForm } from "@/components/nutrition/ManualNutritionForm";
import { MyUsualsPanel } from "@/components/nutrition/MyUsualsPanel";
import { NutritionConfirmDialog } from "@/components/nutrition/NutritionConfirmDialog";
import { NutritionDaySummaryCard } from "@/components/nutrition/NutritionDaySummary";
import { NutritionDescriptionInput } from "@/components/nutrition/NutritionDescriptionInput";
import { NutritionEditSheet } from "@/components/nutrition/NutritionEditSheet";
import {
  MealBarcodeButton,
  MealCameraButton,
} from "@/components/nutrition/MealActionIcons";
import {
  NutritionMealBuilder,
  type MealBuilderSaveValues,
} from "@/components/nutrition/NutritionMealBuilder";
import {
  NutritionRecentFoodEditor,
  type RecentFoodLogValues,
} from "@/components/nutrition/NutritionRecentFoodEditor";
import { PhotoEstimatePanel } from "@/components/nutrition/PhotoEstimatePanel";
import { RecentFoodPicker } from "@/components/nutrition/RecentFoodPicker";
import { SavedFoodEditor } from "@/components/nutrition/SavedFoodEditor";
import { loadSavedFoodDefinitions } from "@/app/actions/saved-food";
import { buttonClassName } from "@/components/ui/Button";
import { cardClass } from "@/components/ui/surfaces";
import {
  mealDraftFromEstimate,
  shouldOpenMealBuilder,
  type MealDraft,
} from "@/lib/meal-builder";
import { shiftCoachDate } from "@/lib/coach";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import { UserResponse } from "@/components/today/UserResponse";
import { getLocalCoachDate } from "@/lib/coach";
import { suggestMealType } from "@/lib/meal-suggestion";
import {
  entryDisplayTitle,
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
import { consumePendingFoodLog } from "@/lib/pending-food-log";
import {
  formatUsualServing,
  LOGGED_TODAY_LABEL,
  loggedTodayKeys,
  nutritionUsualKey,
} from "@/lib/nutrition-usuals";
import {
  findSavedFood,
  overlaySavedFoods,
  savedFoodLoggedToday,
  upsertSavedFood,
  type SavedFoodDefinition,
} from "@/lib/saved-food";

type EntryMode = "compose" | "barcode" | "manual" | "photo" | "describe";

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
  initialDate = null,
}: {
  initialMealType?: MealTypeId | null;
  /** When set (e.g. ?date=yesterday), load/log against this local date. */
  initialDate?: string | null;
}) {
  const router = useRouter();
  const [activeDate, setActiveDate] = useState(
    () => initialDate ?? getLocalLoggedDate(),
  );
  const [loggingOpen, setLoggingOpen] = useState(
    () => initialMealType != null || initialDate != null,
  );
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
    alreadyPortioned?: boolean;
  } | null>(null);
  const [mealDraft, setMealDraft] = useState<MealDraft | null>(null);
  const [mealDraftNotice, setMealDraftNotice] = useState<string | null>(null);
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
  const [entryMode, setEntryMode] = useState<EntryMode | null>("compose");
  const [promptMealSelection, setPromptMealSelection] = useState(false);
  const [barcodeMeta, setBarcodeMeta] = useState<{
    barcode: string;
    brand: string | null;
  } | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [categorySuggestions, setCategorySuggestions] = useState<
    NutritionEntryRecord[]
  >([]);
  const [searchAllCategories, setSearchAllCategories] = useState(false);
  const [selectedRecentIds, setSelectedRecentIds] = useState<string[]>([]);
  const [addingRecent, setAddingRecent] = useState(false);
  const [recentAddError, setRecentAddError] = useState<string | null>(null);
  const [recentAddMessage, setRecentAddMessage] = useState<string | null>(null);
  const [savedFoods, setSavedFoods] = useState<SavedFoodDefinition[]>([]);
  const [editingSaved, setEditingSaved] = useState<NutritionEntryRecord | null>(null);
  const [recentRevision, setRecentRevision] = useState(0);

  const today = getLocalLoggedDate();
  const viewingHistorical = activeDate !== today;
  const yesterday = shiftCoachDate(today, -1);

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

  /** Eaten only — planned food must not fill meal slots for suggestions. */
  const eatenMealTypes = useMemo(
    () => (summary?.eatenEntries ?? []).map((entry) => entry.meal_type),
    [summary],
  );

  const suggestedMealType = useMemo(
    () =>
      suggestMealType({
        now: clock,
        eatenMealTypes,
      }),
    [clock, eatenMealTypes],
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

  /** Empty-section prompt for the time-aware suggested meal (if still empty). */
  const nextMeal = useMemo(() => {
    if (mealGroups[suggestedMealType].length > 0) {
      return null;
    }
    return suggestedMealType;
  }, [mealGroups, suggestedMealType]);

  async function refreshDay(date = activeDate) {
    const result = await loadNutritionDay(date);
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

    void loadNutritionDay(activeDate).then((result) => {
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
  }, [activeDate]);

  useEffect(() => {
    let cancelled = false;
    const mealType = draft.mealType;
    if (!mealType || searchAllCategories) {
      void listRecentNutritionEntries(80).then((result) => {
        if (cancelled) {
          return;
        }
        setCategorySuggestions(result.status === "ok" ? result.entries : []);
      });
      return () => {
        cancelled = true;
      };
    }

    void listRecentNutritionEntries(80, { mealType }).then((result) => {
      if (cancelled) {
        return;
      }
      setCategorySuggestions(result.status === "ok" ? result.entries : []);
    });

    return () => {
      cancelled = true;
    };
  }, [draft.mealType, searchAllCategories, recentRevision]);

  useEffect(() => {
    let cancelled = false;
    void loadSavedFoodDefinitions().then((result) => {
      if (cancelled || result.status !== "ok" || result.foods.length === 0) {
        return;
      }
      setSavedFoods(result.foods);
    });
    return () => {
      cancelled = true;
    };
  }, [activeDate, recentRevision]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Habit confirmation hand-off from Today (sessionStorage). Client-only.
  useEffect(() => {
    const pending = consumePendingFoodLog();
    if (!pending) {
      return;
    }

    const apply = () => {
      setLoggingOpen(true);
      setJustSaved(false);
      setSaveError(null);
      setBarcodeMeta(
        pending.barcode
          ? { barcode: pending.barcode, brand: pending.brand ?? null }
          : null,
      );

      // Habit hand-off often arrives before the day summary; use pending meal
      // when present, otherwise a fresh time-based suggestion.
      const meal =
        pending.mealType ??
        suggestMealType({
          now: new Date(),
          eatenMealTypes: [],
        });

      if (pending.estimate) {
        const synthetic: NutritionEntryRecord = {
          id: `pending-${Date.now()}`,
          logged_date: getLocalLoggedDate(),
          meal_type: meal,
          description: pending.description,
          display_name: pending.displayName,
          search_aliases: [],
          barcode: pending.barcode ?? null,
          brand: pending.brand ?? null,
          status: "eaten",
          calories_estimated: pending.estimate.calories,
          protein_g_estimated: pending.estimate.proteinG,
          carbs_g_estimated: pending.estimate.carbsG,
          fat_g_estimated: pending.estimate.fatG,
          estimation_confidence: pending.estimate.confidence,
          estimation_source: pending.estimate.source,
          meal_id: null,
          portions: null,
          created_at: new Date().toISOString(),
        };
        setRecentFood({ entry: synthetic, estimate: pending.estimate });
        setDraft({
          ...emptyDraft,
          mealType: meal,
          mealTypeSkipped: false,
        });
        setPromptMealSelection(true);
        setEntryMode(null);
        return;
      }

      setRecentFood(null);
      setEntryMode("describe");
      setDraft({
        description: pending.description,
        mealType: meal,
        mealTypeSkipped: false,
        status: "eaten",
      });
      setEditing(null);
      setPromptMealSelection(false);
    };

    queueMicrotask(apply);
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

    if (result.status === "needs_review") {
      openMealBuilderFromEstimate(result.estimate, result.message);
      setClarificationAnswer("");
      return;
    }

    if (result.status !== "ok") {
      setSaveError(result.message);
      setEditing("status");
      return;
    }

    // Scaled from a saved food — open the structured quantity editor.
    if (result.reusedEntryId) {
      const match =
        entries.find((entry) => entry.id === result.reusedEntryId) ?? null;
      if (match) {
        const meal =
          draft.mealType ??
          suggestMealType({ now: new Date(), eatenMealTypes });
        setRecentFood({
          entry: {
            ...match,
            description,
            meal_type: meal,
            calories_estimated: result.estimate.calories,
            protein_g_estimated: result.estimate.proteinG,
            carbs_g_estimated: result.estimate.carbsG,
            fat_g_estimated: result.estimate.fatG,
            estimation_source: result.estimate.source,
            estimation_confidence: result.estimate.confidence,
          },
          estimate: result.estimate,
        });
        setPromptMealSelection(true);
        setEstimate(null);
        setMealDraft(null);
        setClarificationAnswer("");
        setEditing(null);
        return;
      }
    }

    openMealBuilderFromEstimate(result.estimate, null);
    setClarificationAnswer("");
  }

  function openMealBuilderFromEstimate(
    nextEstimate: NutritionEstimate,
    notice: string | null,
  ) {
    if (!shouldOpenMealBuilder(nextEstimate)) {
      setEstimate(nextEstimate);
      setSaveError(notice);
      setEditing(null);
      return;
    }
    setMealDraft(
      mealDraftFromEstimate(nextEstimate, {
        titleFallback: draft.description,
      }),
    );
    setMealDraftNotice(notice);
    setEstimate(null);
    setRecentFood(null);
    setEditing(null);
    setSaveError(null);
  }

  async function handleMealBuilderSave(values: MealBuilderSaveValues) {
    if (saving) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    const result = await saveMealDraftEntry({
      loggedDate: activeDate,
      mealType: values.mealType,
      status: values.status,
      draft: values.draft,
      description: values.description,
      saveDefinition: values.saveDefinition,
      barcode: barcodeMeta?.barcode ?? null,
      brand: barcodeMeta?.brand ?? null,
    });
    if (result.status !== "saved") {
      setSaveError(result.message);
      setSaving(false);
      return;
    }
    await refreshDay();
    setMealDraft(null);
    setMealDraftNotice(null);
    setDraft(emptyDraft);
    setEstimate(null);
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setFromSuggestion(false);
    setRecentFood(null);
    setBarcodeMeta(null);
    setEntryMode(null);
    setPromptMealSelection(false);
    setEditing(null);
    setJustSaved(true);
    setLoggingOpen(false);
    setSaving(false);
    setComposerKey((key) => key + 1);
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
      loggedDate: activeDate,
      description: draft.description,
      mealType: draft.mealTypeSkipped ? null : draft.mealType,
      status: draft.status,
      estimate,
      barcode: barcodeMeta?.barcode ?? null,
      brand: barcodeMeta?.brand ?? null,
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
    setBarcodeMeta(null);
    setEntryMode(null);
    setPromptMealSelection(false);
    setEditing(null);
    setJustSaved(true);
    setLoggingOpen(false);
    setSaving(false);
  }

  function openLogging(mealType: MealTypeId | null = null) {
    const suggested =
      mealType ??
      suggestMealType({
        now: new Date(),
        eatenMealTypes,
      });
    setDraft({
      ...emptyDraft,
      mealType: suggested,
      mealTypeSkipped: false,
    });
    setEstimate(null);
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setClarificationAnswer("");
    setFromSuggestion(false);
    setRecentFood(null);
    setMealDraft(null);
    setMealDraftNotice(null);
    setBarcodeMeta(null);
    setEntryMode("compose");
    setPromptMealSelection(false);
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
    setMealDraft(null);
    setMealDraftNotice(null);
    setBarcodeMeta(null);
    setEntryMode(null);
    setPromptMealSelection(false);
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

  async function addSelectedRecent() {
    const ids = categorySuggestions
      .filter((entry) => selectedRecentIds.includes(entry.id))
      .map((entry) => entry.id);
    if (addingRecent || ids.length === 0) {
      return;
    }
    setAddingRecent(true);
    setRecentAddError(null);
    setRecentAddMessage(null);
    const result = await copyNutritionEntriesToDate({
      loggedDate: activeDate,
      sourceEntryIds: ids,
      allowDuplicates: true,
      mealType: draft.mealType,
    });
    setAddingRecent(false);
    if (result.status !== "ok") {
      setRecentAddError(result.message);
      return;
    }
    if (result.added === 0) {
      setRecentAddError("Those foods couldn’t be added.");
      return;
    }
    setSelectedRecentIds([]);
    setRecentAddMessage(
      `Added ${result.added} ${result.added === 1 ? "food" : "foods"}.`,
    );
    setRecentRevision((current) => current + 1);
    await refreshDay(activeDate);
  }

  function applySuggestion(entry: NutritionEntryRecord) {
    beginEdit();
    setLoggingOpen(true);
    const reused = estimateFromEntry(entry);
    const suggested =
      draft.mealType ??
      suggestMealType({
        now: new Date(),
        eatenMealTypes,
      });

    // Existing foods with saved macros → structured editor (not conversational).
    if (reused) {
      setJustSaved(false);
      setRecentFood({
        entry: { ...entry, meal_type: suggested },
        estimate: reused,
      });
      setDraft({
        ...emptyDraft,
        mealType: suggested,
        mealTypeSkipped: false,
      });
      setEstimate(null);
      setPendingEstimate(null);
      setClarificationQuestion(null);
      setClarificationAnswer("");
      setFromSuggestion(false);
      setPromptMealSelection(true);
      setEditing(null);
      setSaveError(null);
      return;
    }

    // Recent food without macros → fall back to new-food conversational flow.
    setRecentFood(null);
    setDraft({
      description: entry.description,
      mealType: suggested,
      mealTypeSkipped: false,
      status: "eaten",
    });
    setEstimate(null);
    setPendingEstimate(null);
    setClarificationQuestion(null);
    setFromSuggestion(false);
    setPromptMealSelection(false);
    setEditing(null);
  }

  async function handleRecentFoodLog(values: RecentFoodLogValues) {
    if (saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    const result = await saveNutritionEntry({
      loggedDate: activeDate,
      description: values.description,
      mealType: values.mealType,
      status: values.status,
      estimate: {
        ...values.estimate,
        displayName:
          values.estimate.displayName ??
          recentFood?.entry.display_name ??
          null,
      },
      barcode: recentFood?.entry.barcode ?? barcodeMeta?.barcode ?? null,
      brand: recentFood?.entry.brand ?? barcodeMeta?.brand ?? null,
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
    setBarcodeMeta(null);
    setEntryMode(null);
    setPromptMealSelection(false);
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
    displayName: string;
    mealType: MealTypeId | null;
    loggedDate: string;
    portions: number;
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
      description: values.description,
      displayName: values.displayName,
      mealType: values.mealType,
      loggedDate: values.loggedDate,
      portions: values.portions,
      calories: values.calories,
      proteinG: values.proteinG,
      carbsG: values.carbsG,
      fatG: values.fatG,
    });
    setEditSaving(false);
    if (result.status !== "updated") {
      setEditError(result.message);
      return;
    }
    setEditEntry(null);
    // If the entry moved to another day, stay on the day we're viewing.
    await refreshDay(activeDate);
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
    const title = entryDisplayTitle(entry);
    const showIngredients =
      entry.display_name &&
      entry.display_name.trim().toLowerCase() !==
        entry.description.trim().toLowerCase();
    return (
      <li key={entry.id} className="flex flex-col gap-1 py-3">
        <p className="text-[15px] text-foreground">{title}</p>
        {showIngredients ? (
          <p className="text-[13px] leading-5 text-muted">{entry.description}</p>
        ) : null}
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
    loggingOpen ||
    recentFood != null ||
    mealDraft != null ||
    Boolean(draft.description);

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <header className="mb-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Nutrition
        </p>
        <h1 className="mt-2 text-[1.65rem] font-semibold leading-tight tracking-tight sm:text-[1.85rem]">
          {formatNutritionDate(activeDate)}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <span className="sr-only">Diary date</span>
            <input
              type="date"
              value={activeDate}
              max={today}
              onChange={(event) => {
                const next = event.target.value;
                if (!next || next === activeDate) {
                  return;
                }
                setActiveDate(next);
                setReady(false);
                setJustSaved(false);
              }}
              className="h-9 rounded-full border border-border bg-surface px-3 text-[13px] text-foreground outline-none focus:border-primary"
            />
          </label>
          {viewingHistorical ? (
            <button
              type="button"
              onClick={() => {
                setActiveDate(today);
                setReady(false);
              }}
              className="text-[13px] text-muted underline-offset-2 hover:text-foreground hover:underline"
            >
              Back to today
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setActiveDate(yesterday);
                setReady(false);
                setLoggingOpen(true);
              }}
              className="text-[13px] text-muted underline-offset-2 hover:text-foreground hover:underline"
            >
              Log for yesterday
            </button>
          )}
        </div>
        {viewingHistorical ? (
          <p className="mt-2 text-[13px] text-muted">
            Editing {formatLoggedDateLabel(activeDate)}. New entries save to this
            date.
          </p>
        ) : null}
      </header>

      {loadError ? (
        <p role="alert" className="mb-4 text-[13px] leading-6 text-muted">
          {loadError}
        </p>
      ) : null}

      {loggingActive ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[1.35rem] font-semibold tracking-tight text-foreground">
            {draft.mealType
              ? `Add ${labelForMealType(draft.mealType).toLowerCase()}`
              : "Add food"}
          </h2>
          <button
            type="button"
            onClick={resetDescriptionFlow}
            className="inline-flex h-11 items-center px-2 text-[14px] font-medium text-muted"
          >
            Close
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => openLogging(null)}
            className="mb-5 inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-[15px] font-medium text-white"
          >
            + Add meal
          </button>

          {justSaved ? (
            <p className="mb-4 text-[13px] text-muted">Logged. Nice one.</p>
          ) : null}

          {summary ? (
            <NutritionDaySummaryCard summary={summary} now={clock} />
          ) : null}
        </>
      )}

      {loggingActive ? (
        <div className="flex flex-col gap-7">
          {mealDraft ? (
            <NutritionMealBuilder
              key={`meal-${composerKey}`}
              initialDraft={mealDraft}
              initialMealType={
                draft.mealType ?? initialMealType ?? suggestedMealType
              }
              saving={saving}
              error={saveError}
              notice={mealDraftNotice}
              onCancel={resetDescriptionFlow}
              onSave={(values) => void handleMealBuilderSave(values)}
            />
          ) : estimating ? (
            <div className="rounded-2xl border border-border/80 bg-surface/35 px-4 py-8 text-center">
              <p className="font-serif text-[1.35rem] tracking-tight">
                Building your meal…
              </p>
              <p className="mt-2 text-[13px] text-muted">
                Estimating ingredients and nutrition. Nothing is saved until you
                confirm.
              </p>
            </div>
          ) : recentFood ? (
            <NutritionRecentFoodEditor
              key={`${recentFood.entry.id}-${composerKey}`}
              entry={recentFood.entry}
              baseEstimate={recentFood.estimate}
              initialMealType={
                draft.mealType ??
                initialMealType ??
                recentFood.entry.meal_type ??
                suggestedMealType
              }
              promptMealSelection={promptMealSelection}
              alreadyPortioned={recentFood.alreadyPortioned}
              saving={saving}
              error={saveError}
              onCancel={resetDescriptionFlow}
              onLog={(values) => void handleRecentFoodLog(values)}
            />
          ) : entryMode === "barcode" && !draft.description ? (
            <BarcodeScanPanel
              disabled={saving}
              onCancel={() => {
                setEntryMode("compose");
                setBarcodeMeta(null);
              }}
              onConfirm={(payload) => {
                beginEdit();
                const meal =
                  draft.mealType ??
                  suggestMealType({
                    now: new Date(),
                    eatenMealTypes,
                  });
                setBarcodeMeta({
                  barcode: payload.barcode,
                  brand: payload.brand,
                });
                const estimateWithName = {
                  ...payload.estimate,
                  displayName: payload.displayName,
                };
                // Review via structured editor — never auto-save from a scan.
                setRecentFood({
                  entry: {
                    id: `barcode-${payload.barcode}`,
                    logged_date: activeDate,
                    meal_type: meal,
                    description: payload.description,
                    display_name: payload.displayName,
                    search_aliases: [],
                    barcode: payload.barcode,
                    brand: payload.brand,
                    status: "eaten",
                    calories_estimated: estimateWithName.calories,
                    protein_g_estimated: estimateWithName.proteinG,
                    carbs_g_estimated: estimateWithName.carbsG,
                    fat_g_estimated: estimateWithName.fatG,
                    estimation_confidence: estimateWithName.confidence,
                    estimation_source: "open_food_facts",
                    meal_id: null,
                    portions: null,
                    created_at: new Date().toISOString(),
                  },
                  estimate: estimateWithName,
                  alreadyPortioned: true,
                });
                setDraft({
                  ...emptyDraft,
                  mealType: meal,
                  mealTypeSkipped: false,
                });
                setPromptMealSelection(true);
                setEstimate(null);
                setPendingEstimate(null);
                setClarificationQuestion(null);
                setFromSuggestion(false);
                setEntryMode("compose");
                setEditing(null);
              }}
            />
          ) : entryMode === "manual" && !draft.description ? (
            <ManualNutritionForm
              initialMealType={draft.mealType ?? suggestedMealType}
              saving={saving}
              error={saveError}
              onCancel={() => setEntryMode("compose")}
              onSave={(values) => {
                void handleRecentFoodLog({
                  description: values.description,
                  mealType: values.mealType,
                  status: values.status,
                  estimate: values.estimate,
                });
              }}
            />
          ) : entryMode === "photo" && !draft.description ? (
            <PhotoEstimatePanel
              disabled={saving}
              onCancel={() => setEntryMode("compose")}
              onEstimated={(result) => {
                beginEdit();
                setDraft((current) => ({
                  ...current,
                  description: result.description,
                  mealTypeSkipped: false,
                  status: "eaten",
                }));
                openMealBuilderFromEstimate(
                  {
                    ...result.estimate,
                    confidence: "low",
                    displayName:
                      result.estimate.displayName ?? result.description,
                  },
                  result.notice,
                );
                setEntryMode("compose");
              }}
            />
          ) : !draft.description && entryMode !== "describe" ? (
            <>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  Meal
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    ["breakfast", "lunch", "dinner", "snack"] as const
                  ).map((meal) => {
                    const selected = draft.mealType === meal;
                    return (
                      <button
                        key={meal}
                        type="button"
                        onClick={() => {
                          setSearchAllCategories(false);
                          setSelectedRecentIds([]);
                          setRecentAddError(null);
                          setRecentAddMessage(null);
                          setDraft((current) => ({
                            ...current,
                            mealType: meal,
                            mealTypeSkipped: false,
                          }));
                        }}
                        className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border text-foreground hover:border-primary/40"
                        }`}
                      >
                        {labelForMealType(meal)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <section className={`${cardClass} px-4 py-4`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-foreground">
                    {draft.mealType && !searchAllCategories
                      ? `Recent ${labelForMealType(draft.mealType).toLowerCase()}`
                      : "Recent foods"}
                  </p>
                  {draft.mealType ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRecentIds([]);
                        setRecentAddError(null);
                        setRecentAddMessage(null);
                        setSearchAllCategories((current) => !current);
                      }}
                      className="text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline"
                    >
                      {searchAllCategories
                        ? `Show ${labelForMealType(draft.mealType)} only`
                        : "Search all saved foods"}
                    </button>
                  ) : null}
                </div>
                {categorySuggestions.length > 0 ? (
                  <RecentFoodPicker
                    label={
                      draft.mealType && !searchAllCategories
                        ? `Recent ${labelForMealType(draft.mealType)}`
                        : "Recent foods"
                    }
                    busy={addingRecent}
                    selectedIds={selectedRecentIds}
                    items={overlaySavedFoods(categorySuggestions, savedFoods).map((entry) => {
                      const mealFilter =
                        draft.mealType && !searchAllCategories
                          ? draft.mealType
                          : undefined;
                      const todayKeys = loggedTodayKeys(todayEntries, mealFilter);
                      const logged = savedFoodLoggedToday(
                        nutritionUsualKey(entry),
                        todayKeys,
                        savedFoods,
                      );
                      const saved = findSavedFood(savedFoods, {
                        mealId: entry.meal_id,
                        name: entryDisplayTitle(entry),
                      });
                      const protein =
                        entry.protein_g_estimated == null
                          ? null
                          : Math.round(Number(entry.protein_g_estimated));
                      const detail = [
                        saved?.servingLabel ?? formatUsualServing(entry.portions),
                        entry.calories_estimated == null
                          ? null
                          : `${Math.round(entry.calories_estimated)} kcal`,
                        protein == null ? null : `${protein}g protein`,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return {
                        id: entry.id,
                        title: entryDisplayTitle(entry),
                        note: logged ? LOGGED_TODAY_LABEL : undefined,
                        detail,
                      };
                    })}
                    onToggle={(id) =>
                      setSelectedRecentIds((current) =>
                        current.includes(id)
                          ? current.filter((item) => item !== id)
                          : [...current, id],
                      )
                    }
                    onAdd={() => {
                      void addSelectedRecent();
                    }}
                    onEdit={(id) => {
                      const entry = overlaySavedFoods(categorySuggestions, savedFoods).find(
                        (item) => item.id === id,
                      );
                      if (entry) {
                        setEditingSaved(entry);
                      }
                    }}
                  />
                ) : (
                  <p className="mt-3 text-[13px] leading-6 text-muted">
                    {draft.mealType && !searchAllCategories
                      ? `No previous ${labelForMealType(draft.mealType).toLowerCase()} foods yet. Search below or choose another meal.`
                      : "No recent foods yet. Describe a meal or scan a barcode to start."}
                  </p>
                )}
                {recentAddMessage ? (
                  <p className="mt-3 text-[13px] leading-6 text-foreground">
                    {recentAddMessage}
                  </p>
                ) : null}
                {recentAddError ? (
                  <p role="alert" className="mt-3 text-[13px] leading-6 text-muted">
                    {recentAddError}
                  </p>
                ) : null}

                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-[13px] font-semibold text-foreground">
                    Add something else
                  </p>
                  <div className="mt-2">
                    <NutritionDescriptionInput
                      key={composerKey}
                      label="Search or describe food"
                      placeholder="Search foods or describe a meal"
                      enableSuggestions
                      mealType={draft.mealType}
                      searchAllCategories
                      trailingActions={
                        <>
                          <MealBarcodeButton
                            onClick={() => {
                              beginEdit();
                              setEntryMode("barcode");
                            }}
                          />
                          <MealCameraButton
                            onClick={() => {
                              beginEdit();
                              setEntryMode("photo");
                            }}
                          />
                        </>
                      }
                      onSubmit={(description) => {
                        beginEdit();
                        setRecentFood(null);
                        setBarcodeMeta(null);
                        setMealDraft(null);
                        setDraft((current) => ({
                          ...current,
                          description,
                          mealTypeSkipped: false,
                          status: "eaten",
                        }));
                        setEstimate(null);
                        setPendingEstimate(null);
                        setClarificationQuestion(null);
                        setFromSuggestion(false);
                        setEntryMode("describe");
                        setEditing(null);
                        void runEstimate(description);
                      }}
                      onSelectSuggestion={applySuggestion}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        beginEdit();
                        setEntryMode("manual");
                      }}
                      className="mt-1 inline-flex h-11 items-center text-[13px] text-muted underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Enter nutrition manually
                    </button>
                  </div>
                </div>
              </section>
            </>
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
                    setBarcodeMeta(null);
                    setDraft((current) => ({
                      ...current,
                      description: null,
                      mealType: current.mealType,
                      mealTypeSkipped: current.mealTypeSkipped,
                    }));
                    setEntryMode("compose");
                    setEditing(null);
                    setComposerKey((key) => key + 1);
                  }}
                />
              ) : (
                <NutritionDescriptionInput
                  key={composerKey}
                  label="What you’ve eaten"
                  placeholder="e.g. Eggs and toast"
                  enableSuggestions
                  onSubmit={(description) => {
                    beginEdit();
                    setRecentFood(null);
                    setBarcodeMeta(null);
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
                    Which meal is this for? You can change the suggestion or
                    skip.
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
                      className="h-12 w-full rounded-full border border-border bg-surface px-4 text-[15px] text-foreground outline-none placeholder:text-muted focus:border-primary"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-white"
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
                      className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-white disabled:opacity-60"
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
          <MyUsualsPanel
            loggedDate={activeDate}
            existingEntries={todayEntries}
            savedFoods={savedFoods}
            onEditFood={setEditingSaved}
            onCreate={() => openLogging(null)}
            onAdded={async () => {
              await refreshDay(activeDate);
            }}
          />
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
                  <div key={meal} className={`${cardClass} px-4 py-3`}>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-[15px] font-semibold text-foreground">
                        {mealSectionLabel(meal)}
                      </h2>
                      {items.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openLogging(meal)}
                          className="text-[13px] font-medium text-primary"
                        >
                          Add
                        </button>
                      ) : null}
                    </div>
                    {items.length > 0 ? (
                      <ul className="mt-1 divide-y divide-border">
                        {items.map((entry) => renderEntryRow(entry))}
                      </ul>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openLogging(meal)}
                        className={`${buttonClassName("secondary")} mt-3`}
                      >
                        Add {mealSectionLabel(meal).toLowerCase()}
                      </button>
                    )}
                  </div>
                );
              })}

              {mealGroups.other.length > 0 ? (
                <div className={`${cardClass} px-4 py-3`}>
                  <h2 className="text-[15px] font-semibold text-foreground">
                    Other
                  </h2>
                  <ul className="mt-1 divide-y divide-border">
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
            <section className={`${cardClass} px-4 py-4`}>
              <p className="text-[13px] font-semibold text-foreground">
                Recent
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {earlierEntries.slice(0, 6).map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-1">
                    <p className="text-[14px] text-foreground">
                      {entryDisplayTitle(entry)}
                    </p>
                    {entry.display_name &&
                    entry.display_name.trim().toLowerCase() !==
                      entry.description.trim().toLowerCase() ? (
                      <p className="text-[12px] leading-5 text-muted">
                        {entry.description}
                      </p>
                    ) : null}
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
              className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border px-4 text-[13px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
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

      {editingSaved ? (
        <SavedFoodEditor
          entry={editingSaved}
          definition={findSavedFood(savedFoods, {
            mealId: editingSaved.meal_id,
            name: entryDisplayTitle(editingSaved),
          })}
          onClose={() => setEditingSaved(null)}
          onSaved={(food) => {
            setSavedFoods((current) => upsertSavedFood(current, food));
            setEditingSaved(null);
          }}
        />
      ) : null}

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
          body={
            viewingHistorical
              ? "This will update that day’s nutrition totals."
              : "This will update today’s nutrition totals."
          }
          confirmLabel="Remove"
          pending={deletePending}
          onCancel={() => setDeleteEntryId(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </div>
  );
}
