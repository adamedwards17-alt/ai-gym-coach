"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { startSkipWorkoutCoachChat } from "@/app/actions/coach";
import {
  deleteTrainingPlanEntry,
  loadTrainingHub,
  type TrainingHubData,
  updateActivityTargets,
  upsertDailySteps,
  upsertTrainingPlanEntry,
  skipTrainingPlanEntry,
} from "@/app/actions/training";
import { PlanProposalCard } from "@/components/train/PlanProposalCard";
import { TrainingLogExperience } from "@/components/train/TrainingLogExperience";
import { CompactProgressBar } from "@/components/ui/CompactProgressBar";
import { buildStepProgress } from "@/lib/activity-steps";
import {
  buildPlannedVsActual,
  formatDurationDelta,
  skipReasonOptions,
  statusLabel,
  type SkipReasonId,
} from "@/lib/training-plan";
import {
  buildWeekDays,
  buildWeeklyTrainingProgress,
  entriesForDate,
  todayPlanStatus,
} from "@/lib/training-week";
import {
  getLocalSessionDate,
  labelForDuration,
  labelForTrainingType,
  planTrainingTypeOptions,
  type PlanTrainingTypeId,
  type TrainingPlanEntryRecord,
  type TrainingSessionRecord,
  type TrainingTypeId,
} from "@/lib/training";

type HubMode =
  | { kind: "hub" }
  | {
      kind: "log";
      planEntryId?: string | null;
      seedType?: TrainingTypeId | null;
      seedTitle?: string | null;
      seedDuration?: number | null;
      plannedDuration?: number | null;
    }
  | { kind: "plan"; date: string; entry?: TrainingPlanEntryRecord | null }
  | { kind: "skip"; entry: TrainingPlanEntryRecord }
  | {
      kind: "compare";
      plan: TrainingPlanEntryRecord;
      session: TrainingSessionRecord;
    };

export function TrainingHubExperience() {
  const router = useRouter();
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

  const todayPlans = data?.todayPlans ?? [];

  async function handleSaveSteps() {
    setSavingSteps(true);
    setActionError(null);
    const result = await upsertDailySteps({
      stepDate: getLocalSessionDate(),
      steps: Number(stepsDraft.replace(/,/g, "")),
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

  function openComplete(plan: TrainingPlanEntryRecord) {
    setMode({
      kind: "log",
      planEntryId: plan.id,
      seedType:
        plan.training_type === "rest"
          ? null
          : (plan.training_type as TrainingTypeId),
      seedTitle: plan.title,
      seedDuration: null,
      plannedDuration: plan.planned_duration_minutes,
    });
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
          plannedDurationMinutes={mode.plannedDuration ?? null}
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

  if (mode.kind === "skip") {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
        <SkipWorkoutFlow
          entry={mode.entry}
          onCancel={() => setMode({ kind: "hub" })}
          onStarted={(conversationId) => {
            router.push(`/coach/${conversationId}`);
          }}
        />
      </div>
    );
  }

  if (mode.kind === "compare") {
    const comparison = buildPlannedVsActual({
      plan: mode.plan,
      session: mode.session,
    });
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
        <button
          type="button"
          className="mb-5 text-[13px] text-muted transition-colors hover:text-foreground"
          onClick={() => setMode({ kind: "hub" })}
        >
          ← Back
        </button>
        <h1 className="font-serif text-[1.7rem] tracking-tight">
          {comparison.title}
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Planned {comparison.plannedDate}
          {comparison.actualDate
            ? ` · Completed ${comparison.actualDate}`
            : ""}
        </p>
        {comparison.rows.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-border/70">
            <div className="grid grid-cols-3 gap-2 border-b border-border/70 px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-muted">
              <span>Metric</span>
              <span className="text-right">Planned</span>
              <span className="text-right">Actual</span>
            </div>
            {comparison.rows.map((row) => (
              <div
                key={row.metric}
                className="grid grid-cols-3 gap-2 px-4 py-3 text-[13px]"
              >
                <span>{row.metric}</span>
                <span className="text-right text-muted">{row.planned}</span>
                <span className="text-right">{row.actual}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-[14px] text-muted">
            Not enough planned and actual values to compare.
          </p>
        )}
        {formatDurationDelta(comparison.durationDeltaMinutes) ? (
          <p className="mt-4 text-[14px] text-muted">
            {formatDurationDelta(comparison.durationDeltaMinutes)}
          </p>
        ) : null}
      </div>
    );
  }

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

      {data && data.pendingProposals.length > 0 ? (
        <section className="mb-8 space-y-3">
          {data.pendingProposals.map((proposal) => (
            <PlanProposalCard
              key={proposal.id}
              proposal={proposal}
              onResolved={() => void refresh()}
            />
          ))}
        </section>
      ) : null}

      {/* 1. Today's workout */}
      <section className="mb-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Today&apos;s workout
        </h2>

        {todayPlans.length === 0 ? (
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
        ) : (
          <ul className="mt-4 space-y-6">
            {todayPlans.map((plan) => {
              const status = todayPlanStatus({
                plan,
                hasSessionToday: false,
              });
              const linked =
                plan.training_session_id && data
                  ? (data.weekSessions.find(
                      (session) => session.id === plan.training_session_id,
                    ) ??
                    data.recentSessions.find(
                      (session) => session.id === plan.training_session_id,
                    ) ??
                    null)
                  : null;

              return (
                <li key={plan.id}>
                  {status === "rest" ? (
                    <>
                      <p className="font-serif text-[1.45rem] tracking-tight">
                        Rest day
                      </p>
                      <p className="mt-2 text-[14px] leading-6 text-muted">
                        Recovery counts.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-serif text-[1.45rem] tracking-tight">
                        {plan.title}
                      </p>
                      <p className="mt-2 text-[14px] leading-6 text-muted">
                        {labelForTrainingType(plan.training_type)}
                        {plan.focus ? ` · ${plan.focus}` : ""}
                        {plan.planned_duration_minutes
                          ? ` · Planned ${labelForDuration(plan.planned_duration_minutes)}`
                          : ""}
                        {` · ${statusLabel(plan.status)}`}
                      </p>
                      {status === "completed" && linked ? (
                        <p className="mt-1 text-[13px] text-muted">
                          Actual{" "}
                          {linked.duration_minutes
                            ? labelForDuration(linked.duration_minutes)
                            : "duration unknown"}
                          {linked.intensity
                            ? ` · ${linked.intensity.replace(/_/g, " ")}`
                            : ""}
                        </p>
                      ) : null}
                      <div className="mt-4 flex flex-wrap gap-3">
                        {status === "planned" ? (
                          <>
                            <button
                              type="button"
                              className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
                              onClick={() => openComplete(plan)}
                            >
                              Mark as complete
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
                              onClick={() =>
                                setMode({ kind: "skip", entry: plan })
                              }
                            >
                              Skip workout
                            </button>
                          </>
                        ) : null}
                        {status === "completed" && linked ? (
                          <button
                            type="button"
                            className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
                            onClick={() =>
                              setMode({
                                kind: "compare",
                                plan,
                                session: linked,
                              })
                            }
                          >
                            View comparison
                          </button>
                        ) : null}
                        {status === "completed" ? (
                          <button
                            type="button"
                            className="text-[13px] text-muted transition-colors hover:text-foreground"
                            onClick={() => openComplete(plan)}
                          >
                            Edit session
                          </button>
                        ) : null}
                        {status === "skipped" ? (
                          <button
                            type="button"
                            className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
                            onClick={() =>
                              setMode({ kind: "skip", entry: plan })
                            }
                          >
                            Talk to Coach
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-[13px] text-muted transition-colors hover:text-foreground"
                          onClick={() =>
                            setMode({
                              kind: "plan",
                              date: plan.plan_date,
                              entry: plan,
                            })
                          }
                        >
                          Edit plan
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
            <li>
              <button
                type="button"
                className="text-[14px] text-foreground/90 underline-offset-4 hover:underline"
                onClick={() => setMode({ kind: "log" })}
              >
                + Log an unplanned workout
              </button>
            </li>
          </ul>
        )}
      </section>

      {/* 2. Weekly progress */}
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
              label="Planned sessions"
              valueText={`${weekProgress.completedPlannedSessions} / ${weekProgress.target}`}
              fillPercent={weekProgress.fillPercent}
              tone={weekProgress.achieved ? "achieved" : "normal"}
              statusLabel={`${weekProgress.plannedSessions} planned · ${weekProgress.completedPlannedSessions} completed${
                weekProgress.skippedSessions
                  ? ` · ${weekProgress.skippedSessions} skipped`
                  : ""
              }${
                weekProgress.completedDurationMinutes
                  ? ` · ${weekProgress.completedDurationMinutes} min trained`
                  : ""
              }`}
            />
            {weekProgress.unplannedSessions > 0 ? (
              <p className="mt-3 text-[12px] text-muted">
                +{weekProgress.unplannedSessions} unplanned session
                {weekProgress.unplannedSessions === 1 ? "" : "s"} this week
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 3. Weekly plan */}
      <section className="mb-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Weekly plan
        </h2>
        <ul className="mt-4 divide-y divide-border/60">
          {weekDays.map((day) => {
            const entries = data
              ? entriesForDate(data.weekPlan, day.date)
              : [];
            return (
              <li key={day.date} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] text-foreground">
                    {day.weekdayLabel} {day.dayNumber}
                    {day.isToday ? (
                      <span className="text-muted"> · Today</span>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 text-[12px] text-muted transition-colors hover:text-foreground"
                    onClick={() =>
                      setMode({ kind: "plan", date: day.date, entry: null })
                    }
                  >
                    Add
                  </button>
                </div>
                {entries.length === 0 ? (
                  <p className="mt-1 text-[13px] text-muted">Unplanned</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-start justify-between gap-3"
                      >
                        <p className="text-[13px] leading-5 text-muted">
                          {entry.training_type === "rest"
                            ? "Rest"
                            : `${labelForTrainingType(entry.training_type)} · ${entry.title}`}
                          {entry.focus ? ` · ${entry.focus}` : ""}
                          {entry.planned_duration_minutes
                            ? ` · ${labelForDuration(entry.planned_duration_minutes)}`
                            : ""}
                          {` · ${statusLabel(entry.status)}`}
                        </p>
                        <button
                          type="button"
                          className="shrink-0 text-[12px] text-muted transition-colors hover:text-foreground"
                          onClick={() =>
                            setMode({
                              kind: "plan",
                              date: day.date,
                              entry,
                            })
                          }
                        >
                          Edit
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4. Steps */}
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

      {/* 5. Recent */}
      {data && data.recentSessions.length > 0 ? (
        <section className="border-t border-border/70 pt-8">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Recent
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {data.recentSessions.slice(0, 6).map((session) => {
              const linkedPlan =
                data.weekPlan.find(
                  (entry) => entry.training_session_id === session.id,
                ) ?? null;
              return (
                <li key={session.id}>
                  <p className="text-[14px] text-foreground">{session.title}</p>
                  <p className="text-[12px] text-muted">
                    {session.session_date} ·{" "}
                    {labelForTrainingType(session.training_type)}
                    {session.duration_minutes
                      ? ` · ${labelForDuration(session.duration_minutes)}`
                      : ""}
                    {session.intensity
                      ? ` · ${session.intensity.replace(/_/g, " ")}`
                      : ""}
                  </p>
                  {linkedPlan ? (
                    <button
                      type="button"
                      className="mt-1 text-[12px] text-muted underline-offset-2 hover:underline"
                      onClick={() =>
                        setMode({
                          kind: "compare",
                          plan: linkedPlan,
                          session,
                        })
                      }
                    >
                      Planned vs actual
                    </button>
                  ) : null}
                </li>
              );
            })}
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

function SkipWorkoutFlow({
  entry,
  onCancel,
  onStarted,
}: {
  entry: TrainingPlanEntryRecord;
  onCancel: () => void;
  onStarted: (conversationId: string) => void;
}) {
  const [reason, setReason] = useState<SkipReasonId | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!reason || busy) {
      return;
    }
    setBusy(true);
    setError(null);

    const skipped = await skipTrainingPlanEntry({
      entryId: entry.id,
      reason,
      notes: notes.trim() || null,
    });
    if (skipped.status === "error") {
      setBusy(false);
      setError(skipped.message);
      return;
    }

    const chat = await startSkipWorkoutCoachChat({
      localDate: getLocalSessionDate(),
      planEntryId: entry.id,
      title: entry.title,
      planDate: entry.plan_date,
      reason,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (chat.status !== "created") {
      setError(chat.message);
      return;
    }
    onStarted(chat.conversation.id);
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
      <h1 className="font-serif text-[1.7rem] tracking-tight">Skip workout</h1>
      <p className="mt-2 text-[14px] leading-6 text-muted">
        Why can&apos;t &ldquo;{entry.title}&rdquo; happen as planned? Your Coach
        will help reschedule — nothing moves until you confirm.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {skipReasonOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`rounded-full border px-4 py-3 text-left text-[14px] transition-colors ${
              reason === option.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-foreground hover:border-white/20"
            }`}
            onClick={() => setReason(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="mt-5 flex flex-col gap-1.5">
        <span className="text-[12px] text-muted">Optional context</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="e.g. Away until Thursday"
          className="rounded-2xl border border-border bg-surface/60 px-4 py-3 text-[14px] outline-none"
        />
      </label>

      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!reason || busy}
        className="mt-6 inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
        onClick={() => void handleContinue()}
      >
        {busy ? "Starting Coach…" : "Continue with Coach"}
      </button>
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
          onClick={() => {
            setTrainingType("rest");
            setTitle("Rest day");
            setFocus("");
            setDuration("");
          }}
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
