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
  isDraftReadyToSave,
  labelForDuration,
  labelForTrainingType,
  trainingTypeOptions,
  type DurationOptionId,
  type TrainingSessionDraft,
  type TrainingSessionRecord,
  type TrainingTypeId,
} from "@/lib/training";

type Step = "type" | "title" | "duration" | "done";

const emptyDraft: TrainingSessionDraft = {
  trainingType: null,
  title: null,
  durationMinutes: null,
  durationSkipped: false,
};

export function TrainingLogExperience() {
  const [draft, setDraft] = useState<TrainingSessionDraft>(emptyDraft);
  const [editing, setEditing] = useState<Step | null>(null);
  const [sessions, setSessions] = useState<TrainingSessionRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

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
    return "done";
  }, [draft, editing]);

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
  }

  function startAgain() {
    setDraft(emptyDraft);
    setEditing(null);
    setSaveError(null);
    setJustSaved(false);
    setSaving(false);
  }

  function beginEdit() {
    setJustSaved(false);
    setSaveError(null);
    setSaving(false);
  }

  function editType() {
    beginEdit();
    setDraft(emptyDraft);
    setEditing(null);
  }

  function editTitle() {
    beginEdit();
    setDraft((current) => ({
      ...current,
      title: null,
      durationMinutes: null,
      durationSkipped: false,
    }));
    setEditing("title");
  }

  function editDuration() {
    beginEdit();
    setDraft((current) => ({
      ...current,
      durationMinutes: null,
      durationSkipped: false,
    }));
    setEditing("duration");
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
          Train
        </p>
        <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-5xl">
          Log a session
        </h1>
        <p className="mt-3 text-[16px] leading-7 text-muted">
          Tell me what you actually did. Keep it simple.
        </p>
      </header>

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
            onEdit={editType}
          />
        ) : (
          <OptionSelector
            name="Training type"
            options={trainingTypeOptions}
            value={draft.trainingType}
            onChange={(trainingType: TrainingTypeId) => {
              beginEdit();
              setDraft({
                trainingType,
                title: null,
                durationMinutes: null,
                durationSkipped: false,
              });
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
              <UserResponse label={draft.title} onEdit={editTitle} />
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
                  }));
                  setEditing(null);
                }}
              />
            )}
          </>
        ) : null}

        {draft.title ? (
          <>
            <CoachMessage id="train-q-duration">
              Roughly how long?
            </CoachMessage>
            {(draft.durationSkipped || draft.durationMinutes !== null) &&
            step !== "duration" ? (
              <UserResponse
                label={labelForDuration(
                  draft.durationSkipped ? null : draft.durationMinutes,
                )}
                onEdit={editDuration}
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
                  }));
                  setEditing(null);
                }}
              />
            )}
          </>
        ) : null}

        {step === "done" && !justSaved ? (
          <div className="flex flex-col gap-3 pl-10">
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
              {saving ? "Saving…" : saveError ? "Try again" : "Save session"}
            </button>
          </div>
        ) : null}

        {justSaved && !saving ? (
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

        {sessions.length > 0 ? (
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
