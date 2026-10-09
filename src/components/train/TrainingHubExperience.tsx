"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteTrainingPlanEntry,
  loadTrainingHub,
  type TrainingHubData,
  updateActivityTargets,
  upsertDailySteps,
  upsertTrainingPlanEntry,
} from "@/app/actions/training";
import { CompactProgressBar } from "@/components/ui/CompactProgressBar";
import { TrainingLogExperience } from "@/components/train/TrainingLogExperience";
import { buildStepProgress } from "@/lib/activity-steps";
import {
  buildWeekDays,
  buildWeeklyTrainingProgress,
  todayPlanStatus,
} from "@/lib/training-week";
import {
  getLocalSessionDate,
  labelForDuration,
  labelForTrainingType,
  planTrainingTypeOptions,
  type PlanTrainingTypeId,
  type TrainingPlanEntryRecord,
  type TrainingTypeId,
} from "@/lib/training";

type HubMode =
  | { kind: "hub" }
  | { kind: "log"; planEntryId?: string | null; seedType?: TrainingTypeId | null; seedTitle?: string | null; seedDuration?: number | null }
  | { kind: "plan"; date: string; entry?: TrainingPlanEntryRecord | null };

export function TrainingHubExperience() {
  const [data, setData] = useState<TrainingHubData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<HubMode>({ kind: "hub" });
  const [stepsDraft, setStepsDraft] = useState("");
  const [stepTargetDraft, setStepTargetDraft] = useState("");
  const [weekTargetDraft, setWeekTargetDraft] = useState("");
  const [savingSteps, setSavingSteps] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingStepsTarget, setEditingStepsTarget] = useState(false);
  const [editingWeekTarget, setEditingWeekTarget] = useState(false);

  const today = getLocalSessionDate();

  const refresh = useCallback(async () => {
    const result = await loadTrainingHub(getLocalSessionDate());
    if (result.status === "ok") {
      setData(result.data);
      setLoadError(null);
      setStepsDraft(
        result.data.todaySteps ? String(result.data.todaySteps.steps) : "",
      );
      setStepTargetDraft(String(result.data.dailyStepTarget));
      setWeekTargetDraft(String(result.data.weeklySessionTarget));
    } else {
      setLoadError(result.message);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadTrainingHub(getLocalSessionDate()).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setData(result.data);
        setLoadError(null);
        setStepsDraft(
          result.data.todaySteps ? String(result.data.todaySteps.steps) : "",
        );
        setStepTargetDraft(String(result.data.dailyStepTarget));
        setWeekTargetDraft(String(result.data.weeklySessionTarget));
      } else {
        setLoadError(result.message);
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const weekDays = useMemo(
    () => (data ? buildWeekDays({ localDate: data.localDate, today }) : []),
    [data, today],
  );

  const weekProgress = useMemo(() => {
    if (!data) {
      return null;
    }
    return buildWeeklyTrainingProgress({
      localDate: data.localDate,
      target: data.weeklySessionTarget,
      planEntries: data.weekPlan,
      sessions: data.weekSessions,
    });
  }, [data]);

  const stepProgress = useMemo(() => {
    if (!data) {
      return null;
    }
    return buildStepProgress({
      steps: data.todaySteps?.steps ?? null,
      target: data.dailyStepTarget,
    });
  }, [data]);

  const todayStatus = useMemo(() => {
    if (!data) {
      return "unplanned" as const;
    }
    const hasSession = data.weekSessions.some(
      (session) => session.session_date === data.localDate,
    );
    return todayPlanStatus({
      plan: data.todayPlan,
      hasSessionToday: hasSession,
    });
  }, [data]);

  async function handleSaveSteps() {
    if (!data || savingSteps) {
      return;
    }
    setSavingSteps(true);
    setActionError(null);
    const result = await upsertDailySteps({
      stepDate: data.localDate,
      steps: Number(stepsDraft),
    });
    setSavingSteps(false);
    if (result.status !== "saved") {
      setActionError(result.message);
      return;
    }
    await refresh();
  }

  async function handleSaveStepTarget() {
    setActionError(null);
    const result = await updateActivityTargets({
      dailyStepTarget: Number(stepTargetDraft),
    });
    if (result.status !== "saved") {
      setActionError(result.message);
      return;
    }
    setEditingStepsTarget(false);
    await refresh();
  }

  async function handleSaveWeekTarget() {
    setActionError(null);
    const result = await updateActivityTargets({
      weeklySessionTarget: Number(weekTargetDraft),
    });
    if (result.status !== "saved") {
      setActionError(result.message);
      return;
    }
    setEditingWeekTarget(false);
    await refresh();
  }

  if (!ready) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">Loading…</p>
    );
  }

  if (mode.kind === "log") {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
        <button
          type="button"
          className="mb-5 text-[13px] text-muted transition-colors hover:text-foreground"
          onClick={() => {
            setMode({ kind: "hub" });
            void refresh();
          }}
        >
          ← Back to Train
        </button>
        <TrainingLogExperience
          embedded
          planEntryId={mode.planEntryId ?? null}
          initialType={mode.seedType ?? null}
          initialTitle={mode.seedTitle ?? null}
          initialDurationMinutes={mode.seedDuration ?? null}
          onSaved={() => {
            setMode({ kind: "hub" });
            void refresh();
          }}
        />
      </div>
    );
  }

  if (mode.kind === "plan") {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
        <PlanEditor
          date={mode.date}
          entry={mode.entry ?? null}
          onCancel={() => setMode({ kind: "hub" })}
          onSaved={() => {
            setMode({ kind: "hub" });
            void refresh();
          }}
        />
      </div>
    );
  }

  const plan = data?.todayPlan ?? null;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <header className="mb-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Train
        </p>
        <h1 className="mt-2 font-serif text-[1.85rem] leading-tight tracking-tight sm:text-4xl">
          This week
        </h1>
      </header>

      {loadError ? (
        <p role="alert" className="mb-4 text-[13px] text-muted">
          {loadError}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="mb-4 text-[13px] text-muted">
          {actionError}
        </p>
      ) : null}

      {/* A. Today's session */}
      <section className="mb-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Today
        </h2>
        {todayStatus === "rest" ? (
          <div className="mt-4">
            <p className="font-serif text-[1.55rem] tracking-tight">Rest day</p>
            <p className="mt-2 text-[14px] leading-6 text-muted">
              No session planned. Recovery counts.
            </p>
          </div>
        ) : plan && todayStatus === "planned" ? (
          <div className="mt-4">
            <p className="font-serif text-[1.55rem] tracking-tight">
              {plan.title}
            </p>
            <p className="mt-2 text-[14px] leading-6 text-muted">
              {labelForTrainingType(plan.training_type)}
              {plan.focus ? ` · ${plan.focus}` : ""}
              {plan.planned_duration_minutes
                ? ` · ${labelForDuration(plan.planned_duration_minutes)}`
                : ""}
              {" · Planned"}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
                onClick={() =>
                  setMode({
                    kind: "log",
                    planEntryId: plan.id,
                    seedType:
                      plan.training_type === "rest"
                        ? null
                        : (plan.training_type as TrainingTypeId),
                    seedTitle: plan.title,
                    seedDuration: plan.planned_duration_minutes,
                  })
                }
              >
                Complete workout
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
                onClick={() =>
                  setMode({ kind: "plan", date: plan.plan_date, entry: plan })
                }
              >
                Edit
              </button>
              <button
                type="button"
                className="text-[13px] text-muted transition-colors hover:text-foreground"
                onClick={() => setMode({ kind: "log" })}
              >
                Log a different workout
              </button>
            </div>
          </div>
        ) : todayStatus === "completed" ? (
          <div className="mt-4">
            <p className="font-serif text-[1.55rem] tracking-tight">
              {plan?.title ?? "Session completed"}
            </p>
            <p className="mt-2 text-[14px] leading-6 text-muted">
              {plan
                ? `${labelForTrainingType(plan.training_type)}${
                    plan.focus ? ` · ${plan.focus}` : ""
                  } · Completed`
                : "Logged today"}
            </p>
            <button
              type="button"
              className="mt-4 text-[14px] text-foreground/90 underline-offset-4 hover:underline"
              onClick={() => setMode({ kind: "log" })}
            >
              + Log another session
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="font-serif text-[1.55rem] tracking-tight">
              Nothing planned
            </p>
            <p className="mt-2 text-[14px] leading-6 text-muted">
              Add a session for today, or log what you already did.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
                onClick={() => setMode({ kind: "plan", date: today })}
              >
                Add session
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
                onClick={() => setMode({ kind: "log" })}
              >
                Log workout
              </button>
            </div>
          </div>
        )}
      </section>

      {/* B. Daily steps */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Steps
          </h2>
          <button
            type="button"
            className="text-[12px] text-muted transition-colors hover:text-foreground"
            onClick={() => setEditingStepsTarget((value) => !value)}
          >
            {editingStepsTarget ? "Cancel" : "Edit target"}
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Manual entry — not imported from Apple Health.
        </p>

        {editingStepsTarget ? (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">Daily target</span>
              <input
                inputMode="numeric"
                value={stepTargetDraft}
                onChange={(event) => setStepTargetDraft(event.target.value)}
                className="h-11 w-36 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none focus:border-white/20"
              />
            </label>
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
              onClick={() => void handleSaveStepTarget()}
            >
              Save target
            </button>
          </div>
        ) : null}

        {stepProgress ? (
          <div className="mt-4">
            <CompactProgressBar
              label="Today"
              valueText={
                stepProgress.hasEntry
                  ? `${stepProgress.steps?.toLocaleString()} / ${stepProgress.target.toLocaleString()}`
                  : `— / ${stepProgress.target.toLocaleString()}`
              }
              fillPercent={stepProgress.fillPercent}
              tone={stepProgress.achieved ? "achieved" : "normal"}
              statusLabel={
                !stepProgress.hasEntry
                  ? "No steps logged yet today"
                  : stepProgress.achieved
                    ? "Target achieved"
                    : `${stepProgress.remaining.toLocaleString()} remaining`
              }
            />
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">Update steps</span>
                <input
                  inputMode="numeric"
                  value={stepsDraft}
                  placeholder="e.g. 7420"
                  onChange={(event) => setStepsDraft(event.target.value)}
                  className="h-11 w-36 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none focus:border-white/20"
                />
              </label>
              <button
                type="button"
                disabled={savingSteps}
                className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60"
                onClick={() => void handleSaveSteps()}
              >
                {savingSteps ? "Saving…" : "Save steps"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* C. Weekly progress */}
      {weekProgress ? (
        <section className="mb-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Weekly progress
            </h2>
            <button
              type="button"
              className="text-[12px] text-muted transition-colors hover:text-foreground"
              onClick={() => setEditingWeekTarget((value) => !value)}
            >
              {editingWeekTarget ? "Cancel" : "Edit target"}
            </button>
          </div>

          {editingWeekTarget ? (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">Sessions / week</span>
                <input
                  inputMode="numeric"
                  value={weekTargetDraft}
                  onChange={(event) => setWeekTargetDraft(event.target.value)}
                  className="h-11 w-28 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none focus:border-white/20"
                />
              </label>
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
                onClick={() => void handleSaveWeekTarget()}
              >
                Save target
              </button>
            </div>
          ) : null}

          <div className="mt-4">
            <CompactProgressBar
              label="Sessions"
              valueText={`${weekProgress.completedSessions} / ${weekProgress.target}`}
              fillPercent={weekProgress.fillPercent}
              tone={weekProgress.achieved ? "achieved" : "normal"}
              statusLabel={`${weekProgress.plannedSessions} planned · ${weekProgress.completedSessions} completed${
                weekProgress.plannedDurationMinutes ||
                weekProgress.completedDurationMinutes
                  ? ` · ${weekProgress.completedDurationMinutes || 0} / ${
                      weekProgress.plannedDurationMinutes || 0
                    } min`
                  : ""
              }`}
            />
          </div>
        </section>
      ) : null}

      {/* D. Weekly plan */}
      <section className="mb-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Weekly plan
        </h2>
        <ul className="mt-4 divide-y divide-border/60">
          {weekDays.map((day) => {
            const entry =
              data?.weekPlan.find((item) => item.plan_date === day.date) ??
              null;
            return (
              <li key={day.date} className="flex items-start justify-between gap-3 py-3.5">
                <div className="min-w-0">
                  <p className="text-[14px] text-foreground">
                    {day.weekdayLabel} {day.dayNumber}
                    {day.isToday ? (
                      <span className="text-muted"> · Today</span>
                    ) : null}
                  </p>
                  {entry ? (
                    <p className="mt-1 text-[13px] leading-5 text-muted">
                      {entry.training_type === "rest"
                        ? "Rest"
                        : `${labelForTrainingType(entry.training_type)} · ${entry.title}`}
                      {entry.focus ? ` · ${entry.focus}` : ""}
                      {entry.planned_duration_minutes
                        ? ` · ${labelForDuration(entry.planned_duration_minutes)}`
                        : ""}
                      {entry.status === "completed" ? " · Done" : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-[13px] text-muted">Unplanned</p>
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 text-[12px] text-muted transition-colors hover:text-foreground"
                  onClick={() =>
                    setMode({ kind: "plan", date: day.date, entry })
                  }
                >
                  {entry ? "Edit" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Recent logged sessions */}
      {data && data.recentSessions.length > 0 ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Recent
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {data.recentSessions.slice(0, 6).map((session) => (
              <li key={session.id}>
                <p className="text-[14px] text-foreground">{session.title}</p>
                <p className="text-[12px] text-muted">
                  {session.session_date} ·{" "}
                  {labelForTrainingType(session.training_type)}
                  {session.duration_minutes
                    ? ` · ${labelForDuration(session.duration_minutes)}`
                    : ""}
                  {session.intensity
                    ? ` · ${session.intensity.replace("_", " ")}`
                    : ""}
                  {session.calories_burned != null
                    ? ` · ${session.calories_burned} kcal`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-5 text-[14px] text-foreground/90 underline-offset-4 hover:underline"
            onClick={() => setMode({ kind: "log" })}
          >
            + Log workout
          </button>
        </section>
      ) : (
        <button
          type="button"
          className="text-[14px] text-foreground/90 underline-offset-4 hover:underline"
          onClick={() => setMode({ kind: "log" })}
        >
          + Log workout
        </button>
      )}
    </div>
  );
}

function PlanEditor({
  date,
  entry,
  onCancel,
  onSaved,
}: {
  date: string;
  entry: TrainingPlanEntryRecord | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [trainingType, setTrainingType] = useState<PlanTrainingTypeId>(
    entry?.training_type ?? "strength",
  );
  const [title, setTitle] = useState(entry?.title ?? "");
  const [focus, setFocus] = useState(entry?.focus ?? "");
  const [duration, setDuration] = useState(
    entry?.planned_duration_minutes
      ? String(entry.planned_duration_minutes)
      : "",
  );
  const [moveDate, setMoveDate] = useState(date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await upsertTrainingPlanEntry({
      entryId: entry?.id ?? null,
      planDate: moveDate,
      trainingType,
      title: trainingType === "rest" ? "Rest day" : title,
      focus: trainingType === "rest" ? null : focus,
      plannedDurationMinutes:
        trainingType === "rest" || !duration.trim()
          ? null
          : Number(duration),
    });
    setSaving(false);
    if (result.status !== "saved") {
      setError(result.message);
      return;
    }
    onSaved();
  }

  async function handleRemove() {
    if (!entry) {
      onCancel();
      return;
    }
    setSaving(true);
    const result = await deleteTrainingPlanEntry({ entryId: entry.id });
    setSaving(false);
    if (result.status !== "deleted") {
      setError(result.message);
      return;
    }
    onSaved();
  }

  async function handleRest() {
    setTrainingType("rest");
    setTitle("Rest day");
    setFocus("");
    setDuration("");
  }

  return (
    <div>
      <button
        type="button"
        className="mb-5 text-[13px] text-muted transition-colors hover:text-foreground"
        onClick={onCancel}
      >
        ← Back
      </button>
      <h1 className="font-serif text-[1.7rem] tracking-tight">
        {entry ? "Edit session" : "Add session"}
      </h1>
      <p className="mt-2 text-[13px] text-muted">{date}</p>

      <label className="mt-6 flex flex-col gap-1.5">
        <span className="text-[12px] text-muted">Type</span>
        <select
          value={trainingType}
          onChange={(event) =>
            setTrainingType(event.target.value as PlanTrainingTypeId)
          }
          className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none"
        >
          {planTrainingTypeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {trainingType !== "rest" ? (
        <>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Session name</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Upper body"
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none"
            />
          </label>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Focus (optional)</span>
            <input
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              placeholder="e.g. Push / legs"
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none"
            />
          </label>
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">
              Planned duration (min, optional)
            </span>
            <input
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none"
            />
          </label>
        </>
      ) : null}

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-[12px] text-muted">Day</span>
        <input
          type="date"
          value={moveDate}
          onChange={(event) => setMoveDate(event.target.value)}
          className="h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] outline-none"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
          onClick={() => void handleSave()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={saving}
          className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
          onClick={() => void handleRest()}
        >
          Mark rest day
        </button>
        {entry ? (
          <button
            type="button"
            disabled={saving}
            className="text-[13px] text-muted transition-colors hover:text-foreground"
            onClick={() => void handleRemove()}
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            className="text-[13px] text-muted transition-colors hover:text-foreground"
            onClick={onCancel}
          >
            Leave unplanned
          </button>
        )}
      </div>
    </div>
  );
}
