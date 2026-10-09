"use client";

import { useState } from "react";
import { saveTrainingSession } from "@/app/actions/training";
import {
  getLocalSessionDate,
  intensityOptions,
  labelForDuration,
  labelForTrainingType,
  trainingTypeOptions,
  type TrainingIntensityId,
  type TrainingPlanEntryRecord,
  type TrainingSessionRecord,
  type TrainingTypeId,
} from "@/lib/training";

export type WorkoutLogSheetProps = {
  /** Planned entry being completed or edited. Null for unplanned log. */
  plan: TrainingPlanEntryRecord | null;
  /** Existing linked session when editing. */
  session: TrainingSessionRecord | null;
  onCancel: () => void;
  onSaved: () => void;
};

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

export function WorkoutLogSheet({
  plan,
  session,
  onCancel,
  onSaved,
}: WorkoutLogSheetProps) {
  const isEdit = session != null;
  const plannedType =
    plan && plan.training_type !== "rest"
      ? (plan.training_type as TrainingTypeId)
      : null;

  const [title, setTitle] = useState(
    session?.title ?? plan?.title ?? plan?.focus ?? "",
  );
  const [trainingType, setTrainingType] = useState<TrainingTypeId>(
    session?.training_type ?? plannedType ?? "strength",
  );
  const [duration, setDuration] = useState(
    session?.duration_minutes != null ? String(session.duration_minutes) : "",
  );
  const [intensity, setIntensity] = useState<TrainingIntensityId | "">(
    session?.intensity ?? "",
  );
  const [calories, setCalories] = useState(
    session?.calories_burned != null ? String(session.calories_burned) : "",
  );
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Add a workout name or focus.");
      return;
    }

    const durationMinutes = parseOptionalInt(duration);
    if (duration.trim() && (durationMinutes == null || durationMinutes <= 0)) {
      setError("Enter a valid duration in minutes, or leave it blank.");
      return;
    }

    const caloriesBurned = parseOptionalInt(calories);
    if (calories.trim() && caloriesBurned == null) {
      setError("Calories must be a whole number, or leave blank.");
      return;
    }

    setSaving(true);
    setError(null);

    const sessionDate =
      session?.session_date ??
      getLocalSessionDate();

    const result = await saveTrainingSession({
      sessionDate,
      trainingType,
      title: trimmedTitle,
      durationMinutes,
      intensity: intensity || null,
      caloriesBurned,
      notes: notes.trim() || null,
      planEntryId: plan?.id ?? null,
    });

    setSaving(false);
    if (result.status !== "saved") {
      setError(result.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-8 pt-16 sm:items-center sm:pb-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-log-title"
        className="relative max-h-[min(90vh,40rem)] w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-border bg-background p-5 shadow-[0_24px_80px_rgb(0_0_0/0.45)]"
      >
        <p
          id="workout-log-title"
          className="font-serif text-[1.5rem] tracking-tight"
        >
          {isEdit ? "Edit workout" : "Log workout"}
        </p>
        {plan ? (
          <p className="mt-1 text-[13px] text-muted">
            Planned: {labelForTrainingType(plan.training_type)}
            {plan.title ? ` · ${plan.title}` : ""}
            {plan.planned_duration_minutes
              ? ` · ${labelForDuration(plan.planned_duration_minutes)} planned`
              : ""}
            . Enter what you actually did.
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-muted">
            Log an unplanned session. Duration is what you actually completed.
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Name or focus</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Upper body"
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
            />
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] text-muted">Type</legend>
            <div className="flex flex-wrap gap-2">
              {trainingTypeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTrainingType(option.id)}
                  className={`rounded-full border px-3 py-2 text-[13px] transition-colors ${
                    trainingType === option.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:border-white/20"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">
              Actual duration (minutes)
            </span>
            <input
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              placeholder={
                plan?.planned_duration_minutes
                  ? `Planned ${plan.planned_duration_minutes} — enter actual`
                  : "e.g. 45"
              }
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
            />
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[12px] text-muted">Intensity</legend>
            <div className="flex flex-wrap gap-2">
              {intensityOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    setIntensity((current) =>
                      current === option.id ? "" : option.id,
                    )
                  }
                  className={`rounded-full border px-3 py-2 text-[13px] transition-colors ${
                    intensity === option.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:border-white/20"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">
              Calories burned (optional)
            </span>
            <input
              inputMode="numeric"
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
              placeholder="Optional"
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="How it felt, substitutions…"
              className="rounded-2xl border border-border bg-surface/60 px-4 py-3 text-[14px] text-foreground outline-none focus:border-white/20"
            />
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-[13px] text-muted">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save workout"}
          </button>
          <button
            type="button"
            disabled={saving}
            className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
