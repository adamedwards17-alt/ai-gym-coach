"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listRecentTrainingSessions,
  saveTrainingSession,
} from "@/app/actions/training";
import { TextReply } from "@/components/onboarding/TextReply";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import { UserResponse } from "@/components/today/UserResponse";
import {
  durationMinutesFromOption,
  durationOptions,
  formatSessionDateLabel,
  getLocalSessionDate,
  intensityOptions,
  isDraftReadyToSave,
  labelForDuration,
  labelForIntensity,
  labelForTrainingType,
  trainingTypeOptions,
  type DurationOptionId,
  type TrainingIntensityId,
  type TrainingSessionDraft,
  type TrainingSessionRecord,
  type TrainingTypeId,
} from "@/lib/training";

type Step = "type" | "title" | "duration" | "intensity" | "calories" | "done";

const emptyDraft: TrainingSessionDraft = {
  trainingType: null,
  title: null,
  durationMinutes: null,
  durationSkipped: false,
  intensity: null,
  caloriesBurned: null,
};

type TrainingLogExperienceProps = {
  planEntryId?: string | null;
  initialType?: TrainingTypeId | null;
  initialTitle?: string | null;
  /** Prefill actual duration only when editing an existing actual value. */
  initialDurationMinutes?: number | null;
  /** Shown as planned reference — not treated as actual until confirmed. */
  plannedDurationMinutes?: number | null;
  /** When embedded in the hub, hide the outer chrome/recent list. */
  onSaved?: () => void;
  embedded?: boolean;
};

export function TrainingLogExperience({
  planEntryId = null,
  initialType = null,
  initialTitle = null,
  initialDurationMinutes = null,
  plannedDurationMinutes = null,
  onSaved,
  embedded = false,
}: TrainingLogExperienceProps) {
  const [draft, setDraft] = useState<TrainingSessionDraft>(() => ({
    ...emptyDraft,
    trainingType: initialType,
    title: initialTitle,
    durationMinutes: initialDurationMinutes,
    durationSkipped: false,
  }));
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<Step | null>(null);
  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [intensitySkipped, setIntensitySkipped] = useState(false);
  const [caloriesSkipped, setCaloriesSkipped] = useState(false);
  const [caloriesInput, setCaloriesInput] = useState("");

  const step: Step = useMemo(() => {
    if (editing) {
      return editing;
    }
    if (!draft.trainingType) {
      return "type";
    }
    if (!draft.title) {
      return "title";
    }
    if (!draft.durationSkipped && draft.durationMinutes === null) {
      return "duration";
    }
    if (!intensitySkipped && draft.intensity === null) {
      return "intensity";
    }
    if (!caloriesSkipped && draft.caloriesBurned === null) {
      return "calories";
    }
    return "done";
  }, [draft, editing, intensitySkipped, caloriesSkipped]);

  useEffect(() => {
    let cancelled = false;

    void listRecentTrainingSessions().then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setSessions(result.sessions);
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
    if (!isDraftReadyToSave(draft) || !draft.trainingType || !draft.title || saving) {
      return;
    }

    setSaving(true);
    setSaveError(null);

    const result = await saveTrainingSession({
      sessionDate: getLocalSessionDate(),
      trainingType: draft.trainingType,
      title: draft.title,
      durationMinutes: draft.durationSkipped ? null : draft.durationMinutes,
      notes: notes.trim() || null,
      intensity: draft.intensity,
      caloriesBurned: draft.caloriesBurned,
      planEntryId,
    });

    if (result.status !== "saved") {
      setSaveError(result.message);
      setSaving(false);
      return;
    }

    const refreshed = await listRecentTrainingSessions();
    if (refreshed.status === "ok") {
      setSessions(refreshed.sessions);
      setLoadError(null);
    }

    setJustSaved(true);
    setSaving(false);
    onSaved?.();
  }

  function startAgain() {
    setDraft(emptyDraft);
    setEditing(null);
    setSaveError(null);
    setJustSaved(false);
    setSaving(false);
    setIntensitySkipped(false);
    setCaloriesSkipped(false);
    setCaloriesInput("");
  }

  function beginEdit() {
    setJustSaved(false);
    setSaveError(null);
    setSaving(false);
  }

  if (!ready) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">Loading…</p>
    );
  }

  const shellClass = embedded
    ? "flex flex-col gap-7"
    : "mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12";

  return (
    <div className={shellClass}>
      {!embedded ? (
        <header className="mb-10">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Train
          </p>
          <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-5xl">
            Log a session
          </h1>
          <p className="mt-3 text-[16px] leading-7 text-muted">
            Tell me what you actually did. Keep it simple.
          </p>
        </header>
      ) : (
        <header className="mb-6">
          <h1 className="font-serif text-[1.7rem] tracking-tight">
            {planEntryId ? "Complete workout" : "Log a session"}
          </h1>
        </header>
      )}

      {loadError ? (
        <p role="alert" className="mb-6 text-[13px] leading-6 text-muted">
          {loadError}
        </p>
      ) : null}

      <div className="flex flex-col gap-7">
        <CoachMessage>What did you train?</CoachMessage>
        {draft.trainingType && step !== "type" ? (
          <UserResponse
            label={labelForTrainingType(draft.trainingType)}
            onEdit={() => {
              beginEdit();
              setDraft(emptyDraft);
              setIntensitySkipped(false);
              setCaloriesSkipped(false);
              setEditing(null);
            }}
          />
        ) : (
          <OptionSelector
            name="Training type"
            options={trainingTypeOptions}
            value={draft.trainingType}
            onChange={(trainingType: TrainingTypeId) => {
              beginEdit();
              setDraft({
                ...emptyDraft,
                trainingType,
              });
              setIntensitySkipped(false);
              setCaloriesSkipped(false);
              setEditing(null);
            }}
          />
        )}

        {draft.trainingType ? (
          <>
            <CoachMessage id="train-q-title">
              Tell me a bit about it.
            </CoachMessage>
            {draft.title && step !== "title" ? (
              <UserResponse
                label={draft.title}
                onEdit={() => {
                  beginEdit();
                  setDraft((current) => ({
                    ...current,
                    title: null,
                    durationMinutes: null,
                    durationSkipped: false,
                    intensity: null,
                    caloriesBurned: null,
                  }));
                  setIntensitySkipped(false);
                  setCaloriesSkipped(false);
                  setEditing("title");
                }}
              />
            ) : (
              <TextReply
                label="Session description"
                placeholder="e.g. Upper body — push focus"
                initialValue={draft.title ?? ""}
                onSubmit={(title) => {
                  beginEdit();
                  setDraft((current) => ({
                    ...current,
                    title,
                    durationMinutes: null,
                    durationSkipped: false,
                    intensity: null,
                    caloriesBurned: null,
                  }));
                  setIntensitySkipped(false);
                  setCaloriesSkipped(false);
                  setEditing(null);
                }}
              />
            )}
          </>
        ) : null}

        {draft.title ? (
          <>
            <CoachMessage id="train-q-duration">
              {plannedDurationMinutes
                ? `Planned ${plannedDurationMinutes} min — what was the actual duration?`
                : "Roughly how long?"}
            </CoachMessage>
            {(draft.durationSkipped || draft.durationMinutes !== null) &&
            step !== "duration" ? (
              <UserResponse
                label={labelForDuration(
                  draft.durationSkipped ? null : draft.durationMinutes,
                )}
                onEdit={() => {
                  beginEdit();
                  setDraft((current) => ({
                    ...current,
                    durationMinutes: null,
                    durationSkipped: false,
                    intensity: null,
                    caloriesBurned: null,
                  }));
                  setIntensitySkipped(false);
                  setCaloriesSkipped(false);
                  setEditing("duration");
                }}
              />
            ) : (
              <OptionSelector
                name="Duration"
                options={durationOptions}
                value={
                  draft.durationSkipped
                    ? "skip"
                    : draft.durationMinutes
                      ? (String(draft.durationMinutes) as DurationOptionId)
                      : null
                }
                onChange={(optionId: DurationOptionId) => {
                  beginEdit();
                  setDraft((current) => ({
                    ...current,
                    durationSkipped: optionId === "skip",
                    durationMinutes: durationMinutesFromOption(optionId),
                    intensity: null,
                    caloriesBurned: null,
                  }));
                  setIntensitySkipped(false);
                  setCaloriesSkipped(false);
                  setEditing(null);
                }}
              />
            )}
          </>
        ) : null}

        {(draft.durationSkipped || draft.durationMinutes !== null) &&
        draft.title ? (
          <>
            <CoachMessage id="train-q-intensity">
              How hard did it feel? You can skip this.
            </CoachMessage>
            {(draft.intensity || intensitySkipped) && step !== "intensity" ? (
              <UserResponse
                label={
                  intensitySkipped
                    ? "Skipped"
                    : labelForIntensity(draft.intensity)
                }
                onEdit={() => {
                  beginEdit();
                  setDraft((current) => ({
                    ...current,
                    intensity: null,
                    caloriesBurned: null,
                  }));
                  setIntensitySkipped(false);
                  setCaloriesSkipped(false);
                  setEditing("intensity");
                }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <OptionSelector
                  name="Intensity"
                  options={intensityOptions}
                  value={draft.intensity}
                  onChange={(intensity: TrainingIntensityId) => {
                    beginEdit();
                    setDraft((current) => ({
                      ...current,
                      intensity,
                      caloriesBurned: null,
                    }));
                    setIntensitySkipped(false);
                    setCaloriesSkipped(false);
                    setEditing(null);
                  }}
                />
                <button
                  type="button"
                  className="pl-10 text-left text-[13px] text-muted hover:text-foreground"
                  onClick={() => {
                    beginEdit();
                    setIntensitySkipped(true);
                    setDraft((current) => ({
                      ...current,
                      intensity: null,
                      caloriesBurned: null,
                    }));
                    setCaloriesSkipped(false);
                    setEditing(null);
                  }}
                >
                  Skip
                </button>
              </div>
            )}
          </>
        ) : null}

        {(draft.intensity || intensitySkipped) &&
        (draft.durationSkipped || draft.durationMinutes !== null) ? (
          <>
            <CoachMessage id="train-q-calories">
              Calories burned, if you know them? Optional.
            </CoachMessage>
            {(draft.caloriesBurned != null || caloriesSkipped) &&
            step !== "calories" ? (
              <UserResponse
                label={
                  caloriesSkipped
                    ? "Skipped"
                    : `${draft.caloriesBurned} kcal`
                }
                onEdit={() => {
                  beginEdit();
                  setDraft((current) => ({
                    ...current,
                    caloriesBurned: null,
                  }));
                  setCaloriesSkipped(false);
                  setEditing("calories");
                }}
              />
            ) : (
              <form
                className="pl-10"
                onSubmit={(event) => {
                  event.preventDefault();
                  const n = Number(caloriesInput);
                  if (!Number.isFinite(n) || n < 0 || n > 5000) {
                    setSaveError("Enter calories between 0 and 5,000, or skip.");
                    return;
                  }
                  beginEdit();
                  setDraft((current) => ({
                    ...current,
                    caloriesBurned: Math.round(n),
                  }));
                  setCaloriesSkipped(false);
                  setSaveError(null);
                  setEditing(null);
                }}
              >
                <input
                  inputMode="numeric"
                  value={caloriesInput}
                  onChange={(event) => setCaloriesInput(event.target.value)}
                  placeholder="e.g. 420"
                  className="h-12 w-full rounded-full border border-border bg-surface/60 px-4 text-[15px] outline-none placeholder:text-muted focus:border-white/20"
                />
                <div className="mt-3 flex flex-wrap gap-3">
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
                      beginEdit();
                      setCaloriesSkipped(true);
                      setDraft((current) => ({
                        ...current,
                        caloriesBurned: null,
                      }));
                      setEditing(null);
                    }}
                  >
                    Skip
                  </button>
                </div>
              </form>
            )}
          </>
        ) : null}

        {step === "done" && !justSaved ? (
          <div className="flex flex-col gap-3 pl-10">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">
                Notes (optional)
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="How did it feel?"
                className="rounded-2xl border border-border bg-surface/60 px-4 py-3 text-[14px] outline-none"
              />
            </label>
            {plannedDurationMinutes != null &&
            draft.durationMinutes != null ? (
              <p className="text-[12px] text-muted">
                Planned {plannedDurationMinutes} min → actual{" "}
                {draft.durationMinutes} min
              </p>
            ) : null}
            {saveError ? (
              <p role="alert" className="text-[13px] leading-6 text-muted">
                {saveError}
              </p>
            ) : null}
            <button
              type="button"
              disabled={saving}
              className="inline-flex h-11 w-fit items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
              onClick={() => void handleSave()}
            >
              {saving
                ? "Saving…"
                : saveError
                  ? "Try again"
                  : planEntryId
                    ? "Save & complete"
                    : "Save session"}
            </button>
          </div>
        ) : null}

        {justSaved && !saving && !onSaved ? (
          <div className="flex flex-col gap-4">
            <CoachMessage>
              Logged. I’ll remember this for your coaching.
            </CoachMessage>
            <div className="pl-10">
              <button
                type="button"
                className="text-[13px] text-muted transition-colors hover:text-foreground"
                onClick={startAgain}
              >
                Log another session
              </button>
            </div>
          </div>
        ) : null}

        {!embedded && sessions.length > 0 ? (
          <section className="mt-4 border-t border-border/70 pt-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Recent
            </p>
            <ul className="mt-5 flex flex-col gap-4">
              {sessions.map((session) => (
                <li key={session.id} className="flex flex-col gap-1">
                  <p className="text-[14px] text-foreground">{session.title}</p>
                  <p className="text-[12px] leading-5 text-muted">
                    {formatSessionDateLabel(session.session_date)}
                    {" · "}
                    {labelForTrainingType(session.training_type)}
                    {session.duration_minutes !== null
                      ? ` · ${labelForDuration(session.duration_minutes)}`
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
