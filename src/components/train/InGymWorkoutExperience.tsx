"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  abandonWorkoutSession,
  finishWorkoutSession,
  loadInGymWorkout,
  pauseWorkoutSession,
  resumeWorkoutSession,
  saveWorkoutSet,
} from "@/app/actions/workout-session";
import { RestTimer } from "@/components/train/RestTimer";
import { CoachMessage } from "@/components/today/CoachMessage";

type WeightConvention = "per_dumbbell" | "total" | "bodyweight" | "assisted";

type InGymSet = {
  id: string | null;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  completed: boolean;
  skipped: boolean;
  painReported: boolean;
  painNotes: string | null;
};

type InGymExercise = {
  id: string; // template exercise id
  exerciseId: string;
  sortOrder: number;
  prescribedSets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  supersetGroup: string | null;
  notes: string | null;
  exercise: {
    id: string;
    name: string;
    weightConvention: WeightConvention;
    defaultIncrementKg: number;
    notes: string | null;
  };
  lastPerformanceLabel: string | null;
  recommendation: {
    kind: string;
    message: string;
    suggestedWeightKg: number | null;
    suggestedRepsTarget: number | null;
  } | null;
  sets: InGymSet[];
};

type InGymWorkoutData = {
  sessionId: string;
  sessionStatus: "in_progress" | "completed" | "abandoned";
  planEntryId: string | null;
  title: string;
  focus: string | null;
  startedAt: string | null;
  template: {
    id: string;
    name: string;
    focus: string | null;
    exercises: InGymExercise[];
  };
};

type InGymWorkoutExperienceProps = {
  planEntryId?: string | null;
  sessionId?: string | null;
  templateId?: string | null;
  onClose: () => void;
  onFinished: () => void;
};

type SetDraft = {
  id: string | null;
  weight: string;
  reps: string;
  rir: number | null;
  completed: boolean;
  skipped: boolean;
  pain: boolean;
  painNotes: string;
  saving: boolean;
  error: string | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: InGymWorkoutData };

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

function draftKey(templateExerciseId: string, setNumber: number) {
  return `${templateExerciseId}:${setNumber}`;
}

function numberToInput(value: number | null) {
  return value === null || Number.isNaN(value) ? "" : String(value);
}

function parseNumber(value: string): number | null {
  const cleaned = value.trim().replace(",", ".");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function setNumbersFor(exercise: InGymExercise): number[] {
  const highest = exercise.sets.reduce(
    (max, set) => Math.max(max, set.setNumber),
    0,
  );
  const count = Math.max(exercise.prescribedSets, highest);
  return Array.from({ length: count }, (_, index) => index + 1);
}

function repRangeLabel(exercise: InGymExercise) {
  return exercise.repsMin === exercise.repsMax
    ? `${exercise.repsMin}`
    : `${exercise.repsMin}–${exercise.repsMax}`;
}

function weightHint(convention: WeightConvention) {
  switch (convention) {
    case "per_dumbbell":
      return "kg each";
    case "total":
      return "kg total";
    case "assisted":
      return "kg of assistance";
    case "bodyweight":
      return "bodyweight · add load in kg if any";
  }
}

function buildDrafts(data: InGymWorkoutData): Record<string, SetDraft> {
  const drafts: Record<string, SetDraft> = {};
  for (const exercise of data.template.exercises) {
    const suggestedWeight = exercise.recommendation?.suggestedWeightKg ?? null;
    for (const setNumber of setNumbersFor(exercise)) {
      const existing = exercise.sets.find((set) => set.setNumber === setNumber);
      const hasLogged = Boolean(existing?.completed);
      drafts[draftKey(exercise.id, setNumber)] = {
        id: existing?.id ?? null,
        weight: numberToInput(
          existing?.weightKg ?? (hasLogged ? null : suggestedWeight),
        ),
        reps: numberToInput(existing?.reps ?? null),
        rir: existing?.rir ?? null,
        completed: existing?.completed ?? false,
        skipped: existing?.skipped ?? false,
        pain: existing?.painReported ?? false,
        painNotes: existing?.painNotes ?? "",
        saving: false,
        error: null,
      };
    }
  }
  return drafts;
}

export function InGymWorkoutExperience({
  planEntryId = null,
  sessionId = null,
  templateId = null,
  onClose,
  onFinished,
}: InGymWorkoutExperienceProps) {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [rest, setRest] = useState<{ key: string; seconds: number } | null>(
    null,
  );
  const [showSummary, setShowSummary] = useState(false);
  const [confirmingSkip, setConfirmingSkip] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const loadStarted = useRef(false);

  useEffect(() => {
    // Guard so React strict-mode remounts never request the workout twice
    // (loading may create a session on the server).
    if (loadStarted.current) {
      return;
    }
    loadStarted.current = true;
    void loadInGymWorkout({ planEntryId, sessionId, templateId }).then(
      (result) => {
        if (result.status === "ok") {
          setDrafts(buildDrafts(result.data));
          setLoad({ kind: "ready", data: result.data });
        } else {
          setLoad({ kind: "error", message: result.message });
        }
      },
    );
  }, [planEntryId, sessionId, templateId]);

  const data = load.kind === "ready" ? load.data : null;
  const exercises = useMemo(
    () => data?.template.exercises ?? [],
    [data],
  );
  const current = exercises[index] ?? null;
  const next = exercises[index + 1] ?? null;
  const supersetPartner =
    current &&
    next &&
    current.supersetGroup &&
    current.supersetGroup === next.supersetGroup
      ? next
      : null;

  const summary = useMemo(() => {
    let completedSets = 0;
    let skippedSets = 0;
    let painSets = 0;
    let totalSets = 0;
    let exercisesTouched = 0;
    for (const exercise of exercises) {
      let touched = false;
      for (const setNumber of setNumbersFor(exercise)) {
        const draft = drafts[draftKey(exercise.id, setNumber)];
        totalSets += 1;
        if (!draft) {
          continue;
        }
        if (draft.completed) {
          completedSets += 1;
          touched = true;
        } else if (draft.skipped) {
          skippedSets += 1;
        }
        if (draft.pain) {
          painSets += 1;
        }
      }
      if (touched) {
        exercisesTouched += 1;
      }
    }
    return {
      completedSets,
      skippedSets,
      painSets,
      totalSets,
      exercisesTouched,
    };
  }, [exercises, drafts]);

  function patchDraft(key: string, patch: Partial<SetDraft>) {
    setDrafts((previous) => {
      const existing = previous[key];
      if (!existing) {
        return previous;
      }
      return { ...previous, [key]: { ...existing, ...patch } };
    });
  }

  function goToExercise(nextIndex: number) {
    if (nextIndex < 0 || nextIndex >= exercises.length) {
      return;
    }
    setIndex(nextIndex);
    setRest(null);
    setConfirmingSkip(false);
    setActionError(null);
  }

  async function handleConfirmSet(exercise: InGymExercise, setNumber: number) {
    if (!data) {
      return;
    }
    const key = draftKey(exercise.id, setNumber);
    const draft = drafts[key];
    if (!draft || draft.saving) {
      return;
    }

    const weightKg = parseNumber(draft.weight);
    const reps = parseNumber(draft.reps);
    if (draft.weight.trim() && weightKg === null) {
      patchDraft(key, { error: "Enter a valid weight." });
      return;
    }
    if (weightKg !== null && weightKg < 0) {
      patchDraft(key, { error: "Weight can't be negative." });
      return;
    }
    if (reps === null || reps <= 0 || !Number.isInteger(reps)) {
      patchDraft(key, { error: "Enter the reps you completed." });
      return;
    }
    if (
      weightKg === null &&
      exercise.exercise.weightConvention !== "bodyweight"
    ) {
      patchDraft(key, { error: "Enter the weight used." });
      return;
    }

    patchDraft(key, { saving: true, error: null });
    const result = await saveWorkoutSet({
      sessionId: data.sessionId,
      exerciseId: exercise.exerciseId,
      templateExerciseId: exercise.id,
      setNumber,
      weightKg,
      reps,
      rir: draft.rir,
      completed: true,
      skipped: false,
      painReported: draft.pain,
      painNotes: draft.pain ? draft.painNotes.trim() || null : null,
      setLogId: draft.id,
    });

    if (result.status === "error") {
      patchDraft(key, { saving: false, error: result.message });
      return;
    }

    setDrafts((previous) => {
      const updated = { ...previous };
      updated[key] = {
        ...updated[key],
        id: result.setLog.id,
        completed: true,
        skipped: false,
        saving: false,
        error: null,
      };
      // Carry the weight forward to the next untouched set.
      const nextKey = draftKey(exercise.id, setNumber + 1);
      const nextDraft = updated[nextKey];
      if (
        nextDraft &&
        !nextDraft.completed &&
        weightKg !== null &&
        (!nextDraft.weight.trim() ||
          nextDraft.weight === numberToInput(exercise.recommendation?.suggestedWeightKg ?? null))
      ) {
        updated[nextKey] = { ...nextDraft, weight: numberToInput(weightKg) };
      }
      return updated;
    });

    const isFinalSet =
      setNumber >= setNumbersFor(exercise).length && !next && !supersetPartner;
    if (exercise.restSeconds > 0 && !isFinalSet) {
      setRest({
        key: `${exercise.id}:${exercise.restSeconds}:${setNumber}`,
        seconds: exercise.restSeconds,
      });
    }
  }

  async function handleSkipExercise() {
    if (!data || !current || busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    setConfirmingSkip(false);

    let failure: string | null = null;
    for (const setNumber of setNumbersFor(current)) {
      const key = draftKey(current.id, setNumber);
      const draft = drafts[key];
      if (!draft || draft.completed) {
        continue;
      }
      const result = await saveWorkoutSet({
        sessionId: data.sessionId,
        exerciseId: current.exerciseId,
        templateExerciseId: current.id,
        setNumber,
        weightKg: null,
        reps: null,
        rir: null,
        completed: false,
        skipped: true,
        painReported: false,
        painNotes: null,
        setLogId: draft.id,
      });
      if (result.status === "error") {
        failure = result.message;
        break;
      }
      patchDraft(key, {
        id: result.setLog.id,
        skipped: true,
        completed: false,
        error: null,
      });
    }

    setBusy(false);
    if (failure) {
      setActionError(failure);
      return;
    }
    setRest(null);
    if (index < exercises.length - 1) {
      setIndex(index + 1);
    }
  }

  async function handlePause() {
    if (!data || busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await pauseWorkoutSession(data.sessionId);
    setBusy(false);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    setPaused(true);
  }

  async function handleResume() {
    if (!data || busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await resumeWorkoutSession(data.sessionId);
    setBusy(false);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    setPaused(false);
  }

  async function handleSaveAndExit() {
    if (!data || busy) {
      return;
    }
    if (paused) {
      onClose();
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await pauseWorkoutSession(data.sessionId);
    setBusy(false);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    onClose();
  }

  async function handleFinish() {
    if (!data || busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await finishWorkoutSession({
      sessionId: data.sessionId,
      planEntryId: data.planEntryId ?? planEntryId,
    });
    setBusy(false);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    onFinished();
  }

  async function handleDiscard() {
    if (!data || busy) {
      return;
    }
    setBusy(true);
    setActionError(null);
    const result = await abandonWorkoutSession(data.sessionId);
    setBusy(false);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    onClose();
  }

  if (load.kind === "loading") {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">
        Loading workout…
      </p>
    );
  }

  if (load.kind === "error" || !data) {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
        <button
          type="button"
          className="mb-5 text-[13px] text-muted transition-colors hover:text-foreground"
          onClick={onClose}
        >
          ← Back
        </button>
        <h1 className="font-serif text-[1.7rem] tracking-tight">
          Couldn&apos;t open workout
        </h1>
        <p role="alert" className="mt-3 text-[14px] leading-6 text-muted">
          {load.kind === "error" ? load.message : "Something went wrong."}
        </p>
      </div>
    );
  }

  if (data.sessionStatus !== "in_progress") {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
        <button
          type="button"
          className="mb-5 text-[13px] text-muted transition-colors hover:text-foreground"
          onClick={onClose}
        >
          ← Back
        </button>
        <h1 className="font-serif text-[1.7rem] tracking-tight">
          {data.title}
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-muted">
          {data.sessionStatus === "completed"
            ? "This workout is already finished."
            : "This workout was abandoned."}
        </p>
      </div>
    );
  }

  const shell =
    "mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12";

  if (showSummary) {
    return (
      <div className={shell}>
        <button
          type="button"
          className="mb-5 text-[13px] text-muted transition-colors hover:text-foreground"
          onClick={() => {
            setShowSummary(false);
            setActionError(null);
          }}
        >
          ← Keep training
        </button>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Finish workout
        </p>
        <h1 className="mt-2 font-serif text-[1.85rem] leading-tight tracking-tight">
          {data.title}
        </h1>

        <dl className="mt-6 divide-y divide-border/60 text-[14px]">
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-muted">Sets completed</dt>
            <dd>
              {summary.completedSets} / {summary.totalSets}
            </dd>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-muted">Exercises trained</dt>
            <dd>
              {summary.exercisesTouched} / {exercises.length}
            </dd>
          </div>
          {summary.skippedSets > 0 ? (
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-muted">Sets skipped</dt>
              <dd>{summary.skippedSets}</dd>
            </div>
          ) : null}
          {summary.painSets > 0 ? (
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-muted">Sets with pain flagged</dt>
              <dd>{summary.painSets}</dd>
            </div>
          ) : null}
        </dl>

        {summary.completedSets === 0 ? (
          <p className="mt-4 text-[13px] leading-6 text-muted">
            No sets have been logged yet. You can still finish, but nothing
            will count towards your history.
          </p>
        ) : null}

        {actionError ? (
          <p role="alert" className="mt-4 text-[13px] text-muted">
            {actionError}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
            onClick={() => void handleFinish()}
          >
            {busy ? "Finishing…" : "Finish workout"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60"
            onClick={() => setShowSummary(false)}
          >
            Keep training
          </button>
        </div>
      </div>
    );
  }

  const progressPercent =
    exercises.length > 0 ? ((index + 1) / exercises.length) * 100 : 0;
  const focus = data.focus ?? data.template.focus;

  return (
    <div className={shell}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={busy}
          className="text-[13px] text-muted transition-colors hover:text-foreground disabled:opacity-60"
          onClick={() => void handleSaveAndExit()}
        >
          ← Save &amp; exit
        </button>
        {paused ? (
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-60"
            onClick={() => void handleResume()}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-60"
            onClick={() => void handlePause()}
          >
            Pause
          </button>
        )}
      </div>

      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          {paused ? "Paused" : "In the gym"}
        </p>
        <h1 className="mt-2 font-serif text-[1.85rem] leading-tight tracking-tight sm:text-4xl">
          {data.title}
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          {exercises.length > 0
            ? `Exercise ${index + 1} / ${exercises.length}`
            : "No exercises"}
          {focus ? ` · ${focus}` : ""}
          {` · ${summary.completedSets}/${summary.totalSets} sets`}
        </p>
        <div className="mt-3 h-px w-full bg-border/60">
          <div
            className="h-px bg-foreground/70 transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </header>

      {actionError ? (
        <p role="alert" className="mt-4 text-[13px] text-muted">
          {actionError}
        </p>
      ) : null}

      {!current ? (
        <p className="mt-8 text-[14px] leading-6 text-muted">
          This workout template has no exercises yet.
        </p>
      ) : paused ? (
        <section className="mt-10">
          <p className="font-serif text-[1.45rem] tracking-tight">
            Workout paused
          </p>
          <p className="mt-2 text-[14px] leading-6 text-muted">
            Your logged sets are saved. Resume when you&apos;re ready.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
              onClick={() => void handleResume()}
            >
              Resume workout
            </button>
            <button
              type="button"
              disabled={busy}
              className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60"
              onClick={() => setShowSummary(true)}
            >
              Finish
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="font-serif text-[1.55rem] leading-tight tracking-tight">
              {current.exercise.name}
            </h2>
            <p className="mt-2 text-[14px] leading-6 text-muted">
              {current.prescribedSets} × {repRangeLabel(current)} reps ·{" "}
              {weightHint(current.exercise.weightConvention)}
              {current.restSeconds > 0
                ? ` · ${current.restSeconds}s rest`
                : ""}
            </p>
            {current.lastPerformanceLabel ? (
              <p className="mt-1 text-[13px] text-muted">
                Last time: {current.lastPerformanceLabel}
              </p>
            ) : null}
            {supersetPartner ? (
              <p className="mt-2 text-[13px] text-foreground/90">
                {`Superset ${current.supersetGroup} with ${supersetPartner.exercise.name}`}
              </p>
            ) : null}
            {current.notes || current.exercise.notes ? (
              <p className="mt-2 text-[12px] leading-5 text-muted">
                {current.notes ?? current.exercise.notes}
              </p>
            ) : null}
          </section>

          {current.recommendation ? (
            <div className="mt-5">
              <CoachMessage>{current.recommendation.message}</CoachMessage>
            </div>
          ) : null}

          <section className="mt-8">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Sets
            </h3>
            <ul className="mt-3 space-y-3">
              {setNumbersFor(current).map((setNumber) => {
                const key = draftKey(current.id, setNumber);
                const draft = drafts[key];
                if (!draft) {
                  return null;
                }
                return (
                  <SetRow
                    key={key}
                    exercise={current}
                    setNumber={setNumber}
                    draft={draft}
                    onChange={(patch) => patchDraft(key, patch)}
                    onConfirm={() => void handleConfirmSet(current, setNumber)}
                  />
                );
              })}
            </ul>
          </section>

          {rest ? (
            <div className="mt-6">
              <RestTimer
                key={rest.key}
                seconds={rest.seconds}
                onComplete={() => setRest(null)}
              />
            </div>
          ) : null}

          <section className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            {supersetPartner ? (
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
                onClick={() => goToExercise(index + 1)}
              >
                {`Go to ${supersetPartner.exercise.name}`}
              </button>
            ) : null}
            {confirmingSkip ? (
              <span className="flex items-center gap-3 text-[13px] text-muted">
                Skip remaining sets?
                <button
                  type="button"
                  disabled={busy}
                  className="text-foreground underline-offset-4 hover:underline disabled:opacity-60"
                  onClick={() => void handleSkipExercise()}
                >
                  Yes, skip
                </button>
                <button
                  type="button"
                  className="transition-colors hover:text-foreground"
                  onClick={() => setConfirmingSkip(false)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                className="text-[13px] text-muted transition-colors hover:text-foreground disabled:opacity-60"
                onClick={() => setConfirmingSkip(true)}
              >
                Skip exercise
              </button>
            )}
          </section>
        </>
      )}

      {exercises.length > 0 && !paused ? (
        <nav
          aria-label="Exercise navigation"
          className="mt-8 flex items-center justify-between gap-3 border-t border-border/60 pt-5"
        >
          <button
            type="button"
            disabled={index === 0}
            className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-40"
            onClick={() => goToExercise(index - 1)}
          >
            ← Prev
          </button>
          {index < exercises.length - 1 ? (
            <button
              type="button"
              className={`inline-flex h-11 items-center rounded-full px-5 text-sm ${
                supersetPartner
                  ? "border border-border text-foreground"
                  : "bg-foreground font-medium text-background"
              }`}
              onClick={() => goToExercise(index + 1)}
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
              onClick={() => setShowSummary(true)}
            >
              Finish
            </button>
          )}
        </nav>
      ) : null}

      <footer className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
        {index < exercises.length - 1 && !paused ? (
          <button
            type="button"
            className="text-[13px] text-muted transition-colors hover:text-foreground"
            onClick={() => setShowSummary(true)}
          >
            Finish workout early
          </button>
        ) : null}
        {confirmingDiscard ? (
          <span className="flex items-center gap-3 text-[13px] text-muted">
            Discard this workout?
            <button
              type="button"
              disabled={busy}
              className="text-foreground underline-offset-4 hover:underline disabled:opacity-60"
              onClick={() => void handleDiscard()}
            >
              Yes, discard
            </button>
            <button
              type="button"
              className="transition-colors hover:text-foreground"
              onClick={() => setConfirmingDiscard(false)}
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            className="text-[13px] text-muted transition-colors hover:text-foreground disabled:opacity-60"
            onClick={() => setConfirmingDiscard(true)}
          >
            Discard workout
          </button>
        )}
      </footer>
    </div>
  );
}

function SetRow({
  exercise,
  setNumber,
  draft,
  onChange,
  onConfirm,
}: {
  exercise: InGymExercise;
  setNumber: number;
  draft: SetDraft;
  onChange: (patch: Partial<SetDraft>) => void;
  onConfirm: () => void;
}) {
  const step =
    exercise.exercise.defaultIncrementKg > 0
      ? exercise.exercise.defaultIncrementKg
      : 2.5;
  const weightLabel =
    exercise.exercise.weightConvention === "per_dumbbell"
      ? "kg each"
      : exercise.exercise.weightConvention === "assisted"
        ? "kg assist"
        : "kg";
  const repsPlaceholder =
    exercise.recommendation?.suggestedRepsTarget != null
      ? String(exercise.recommendation.suggestedRepsTarget)
      : repRangeLabel(exercise);

  function nudgeWeight(direction: 1 | -1) {
    const base = parseNumber(draft.weight) ?? 0;
    const nextValue = Math.max(0, Math.round((base + direction * step) * 100) / 100);
    onChange({ weight: String(nextValue), error: null });
  }

  const border = draft.completed
    ? "border-foreground/25 bg-white/[0.03]"
    : "border-border/60";

  return (
    <li className={`rounded-2xl border px-4 py-4 ${border}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] text-foreground">Set {setNumber}</p>
        <p className="text-[12px] text-muted">
          {draft.completed
            ? "Logged"
            : draft.skipped
              ? "Skipped"
              : "To do"}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">{weightLabel}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Decrease weight"
              className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-full border border-border text-[16px] text-muted transition-colors hover:text-foreground"
              onClick={() => nudgeWeight(-1)}
            >
              −
            </button>
            <input
              inputMode="decimal"
              value={draft.weight}
              placeholder="0"
              onChange={(event) =>
                onChange({ weight: event.target.value, error: null })
              }
              className="h-11 w-full min-w-0 rounded-full border border-border bg-surface/60 px-3 text-center text-[15px] outline-none focus:border-white/20"
            />
            <button
              type="button"
              aria-label="Increase weight"
              className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-full border border-border text-[16px] text-muted transition-colors hover:text-foreground"
              onClick={() => nudgeWeight(1)}
            >
              +
            </button>
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">Reps</span>
          <input
            inputMode="numeric"
            value={draft.reps}
            placeholder={repsPlaceholder}
            onChange={(event) =>
              onChange({ reps: event.target.value, error: null })
            }
            className="h-11 w-full min-w-0 rounded-full border border-border bg-surface/60 px-3 text-center text-[15px] outline-none focus:border-white/20"
          />
        </label>
      </div>

      <div className="mt-3">
        <p className="text-[12px] text-muted">RIR (optional)</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {RIR_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={draft.rir === value}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-[13px] transition-colors ${
                draft.rir === value
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-foreground hover:border-white/20"
              }`}
              onClick={() =>
                onChange({ rir: draft.rir === value ? null : value })
              }
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          aria-pressed={draft.pain}
          className={`text-[13px] transition-colors ${
            draft.pain
              ? "text-foreground underline underline-offset-4"
              : "text-muted hover:text-foreground"
          }`}
          onClick={() => onChange({ pain: !draft.pain })}
        >
          {draft.pain ? "Pain flagged — tap to clear" : "Felt pain?"}
        </button>
        {draft.pain ? (
          <div className="mt-2 space-y-2">
            <p className="text-[12px] leading-5 text-muted">
              Take care — you can still log this set, but ease off or stop if it
              doesn&apos;t feel right. Your Coach will see the flag.
            </p>
            <input
              value={draft.painNotes}
              placeholder="Where / what did it feel like? (optional)"
              onChange={(event) => onChange({ painNotes: event.target.value })}
              className="h-11 w-full rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none focus:border-white/20"
            />
          </div>
        ) : null}
      </div>

      {draft.error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {draft.error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={draft.saving}
        className={`mt-4 inline-flex h-11 w-full items-center justify-center rounded-full text-sm disabled:opacity-60 ${
          draft.completed
            ? "border border-border text-foreground"
            : "bg-foreground font-medium text-background"
        }`}
        onClick={onConfirm}
      >
        {draft.saving
          ? "Saving…"
          : draft.completed
            ? "Update set"
            : "Confirm set"}
      </button>
    </li>
  );
}
