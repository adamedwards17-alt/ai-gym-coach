"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { startSkipWorkoutCoachChat } from "@/app/actions/coach";
import {
  activateMuscleBuildingProgramme,
  loadActiveProgramme,
} from "@/app/actions/programme";
import {
  deleteTrainingPlanEntry,
  loadTrainingHub,
  type TrainingHubData,
  updateActivityTargets,
  upsertDailySteps,
  upsertTrainingPlanEntry,
  skipTrainingPlanEntry,
} from "@/app/actions/training";
import { InGymWorkoutExperience } from "@/components/train/InGymWorkoutExperience";
import { PlanProposalCard } from "@/components/train/PlanProposalCard";
import { WorkoutLogSheet } from "@/components/train/WorkoutLogSheet";
import { CompactProgressBar } from "@/components/ui/CompactProgressBar";
import { buildStepProgress } from "@/lib/activity-steps";
import type { TrainingProgrammeSummary } from "@/lib/workout-tracking";
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
  formatWeekRangeLabel,
  isSameWeek,
  shiftWeek,
  startOfWeekMonday,
  todayPlanStatus,
  weekRelationToToday,
} from "@/lib/training-week";
import {
  getLocalSessionDate,
  labelForDuration,
  labelForTrainingType,
  planTrainingTypeOptions,
  type PlanTrainingTypeId,
  type TrainingPlanEntryRecord,
  type TrainingSessionRecord,
} from "@/lib/training";

type HubMode =
  | { kind: "hub" }
  | { kind: "plan"; date: string; entry?: TrainingPlanEntryRecord | null }
  | { kind: "skip"; entry: TrainingPlanEntryRecord }
  | {
      kind: "compare";
      plan: TrainingPlanEntryRecord;
      session: TrainingSessionRecord;
    };

type LogSheetState = {
  plan: TrainingPlanEntryRecord | null;
  session: TrainingSessionRecord | null;
};

type InGymState = {
  planEntryId: string | null;
  sessionId: string | null;
  templateId: string | null;
};

export function TrainingHubExperience() {
  const router = useRouter();
  const [data, setData] = useState<TrainingHubData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<HubMode>({ kind: "hub" });
  const [logSheet, setLogSheet] = useState<LogSheetState | null>(null);
  const [inGym, setInGym] = useState<InGymState | null>(null);
  const [programme, setProgramme] = useState<TrainingProgrammeSummary | null>(
    null,
  );
  const [activatingProgramme, setActivatingProgramme] = useState(false);
  const [selectedWeekDate, setSelectedWeekDate] = useState(() =>
    getLocalSessionDate(),
  );
  const [stepsDraft, setStepsDraft] = useState("");
  const [stepTargetDraft, setStepTargetDraft] = useState("");
  const [weekTargetDraft, setWeekTargetDraft] = useState("");
  const [savingSteps, setSavingSteps] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingStepsTarget, setEditingStepsTarget] = useState(false);
  const [editingWeekTarget, setEditingWeekTarget] = useState(false);

  const today = getLocalSessionDate();
  const weekRelation = weekRelationToToday(selectedWeekDate, today);
  const viewingCurrentWeek = weekRelation === "current";

  const applyHubData = useCallback((hub: TrainingHubData) => {
    setData(hub);
    setLoadError(null);
    setStepsDraft(hub.todaySteps ? String(hub.todaySteps.steps) : "");
    setStepTargetDraft(String(hub.dailyStepTarget));
    setWeekTargetDraft(String(hub.weeklySessionTarget));
  }, []);

  /** Load key: today when viewing the current week so steps/today slots stay accurate. */
  const weekLoadDate = useMemo(() => {
    return isSameWeek(selectedWeekDate, today)
      ? today
      : startOfWeekMonday(selectedWeekDate);
  }, [selectedWeekDate, today]);

  const refresh = useCallback(
    async (weekDate: string = selectedWeekDate) => {
      const loadDate = isSameWeek(weekDate, getLocalSessionDate())
        ? getLocalSessionDate()
        : startOfWeekMonday(weekDate);
      const result = await loadTrainingHub(loadDate);
      if (result.status === "ok") {
        applyHubData(result.data);
      } else {
        setLoadError(result.message);
      }
      setReady(true);
    },
    [applyHubData, selectedWeekDate],
  );

  useEffect(() => {
    let cancelled = false;
    const loadDate = weekLoadDate;

    void loadTrainingHub(loadDate).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        applyHubData(result.data);
      } else {
        setLoadError(result.message);
      }
      setReady(true);
    });

    void loadActiveProgramme().then((result) => {
      if (cancelled || result.status !== "ok") {
        return;
      }
      setProgramme(result.programme);
    });

    return () => {
      cancelled = true;
    };
  }, [weekLoadDate, applyHubData]);

  const weekDays = useMemo(
    () =>
      data
        ? buildWeekDays({ localDate: data.localDate, today })
        : buildWeekDays({ localDate: selectedWeekDate, today }),
    [data, selectedWeekDate, today],
  );

  const weekProgress = useMemo(() => {
    if (!data) {
      return null;
    }
    return buildWeeklyTrainingProgress({
      localDate: data.localDate,
      today,
      target: data.weeklySessionTarget,
      planEntries: data.weekPlan,
      sessions: data.weekSessions,
    });
  }, [data, today]);

  const stepProgress = useMemo(() => {
    if (!data || !viewingCurrentWeek) {
      return null;
    }
    return buildStepProgress({
      steps: data.todaySteps?.steps ?? null,
      target: data.dailyStepTarget,
    });
  }, [data, viewingCurrentWeek]);

  const todayPlans = useMemo(() => {
    if (!data || !viewingCurrentWeek) {
      return [];
    }
    return entriesForDate(data.weekPlan, today);
  }, [data, viewingCurrentWeek, today]);

  function goToWeek(nextWeekDate: string) {
    setSelectedWeekDate(startOfWeekMonday(nextWeekDate));
    setMode({ kind: "hub" });
    setActionError(null);
  }

  function findLinkedSession(
    plan: TrainingPlanEntryRecord,
  ): TrainingSessionRecord | null {
    if (!data || !plan.training_session_id) {
      return null;
    }
    return (
      data.weekSessions.find(
        (session) => session.id === plan.training_session_id,
      ) ??
      data.recentSessions.find(
        (session) => session.id === plan.training_session_id,
      ) ??
      null
    );
  }

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
    if (plan.training_type === "strength") {
      const linked = findLinkedSession(plan);
      setInGym({
        planEntryId: plan.id,
        // Re-open the linked session when editing an already completed workout.
        sessionId: plan.status === "completed" && linked ? linked.id : null,
        templateId: plan.workout_template_id,
      });
      return;
    }
    setLogSheet({
      plan,
      session: findLinkedSession(plan),
    });
  }

  async function handleActivateProgramme() {
    setActivatingProgramme(true);
    setActionError(null);
    const result = await activateMuscleBuildingProgramme({ weeksToSeed: 2 });
    setActivatingProgramme(false);
    if (result.status === "error") {
      setActionError(result.message);
      return;
    }
    setProgramme(result.programme);
    await refresh(selectedWeekDate);
  }

  function openUnplannedLog() {
    setLogSheet({ plan: null, session: null });
  }

  if (!ready) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">Loading…</p>
    );
  }

  if (inGym) {
    return (
      <InGymWorkoutExperience
        planEntryId={inGym.planEntryId}
        sessionId={inGym.sessionId}
        templateId={inGym.templateId}
        onClose={() => {
          setInGym(null);
          void refresh(selectedWeekDate);
        }}
        onFinished={() => {
          setInGym(null);
          void refresh(selectedWeekDate);
        }}
      />
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
            void refresh(selectedWeekDate);
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

  const weekLabel = formatWeekRangeLabel(selectedWeekDate);

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      {logSheet ? (
        <WorkoutLogSheet
          plan={logSheet.plan}
          session={logSheet.session}
          onCancel={() => setLogSheet(null)}
          onSaved={() => {
            setLogSheet(null);
            void refresh(selectedWeekDate);
          }}
        />
      ) : null}

      <header className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Train
        </p>
        <h1 className="mt-2 font-serif text-[1.85rem] leading-tight tracking-tight sm:text-4xl">
          Training plan
        </h1>
      </header>

      {programme ? (
        <section className="mb-6 rounded-2xl border border-border/70 px-4 py-3.5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Active phase
          </p>
          <p className="mt-1 text-[15px] text-foreground/92">
            {programme.activePhase?.name ?? programme.name}
          </p>
          {programme.upcomingPhase ? (
            <p className="mt-1 text-[13px] text-muted">
              Next: {programme.upcomingPhase.name}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="mb-6 rounded-2xl border border-border/70 px-4 py-3.5">
          <p className="text-[14px] leading-6 text-foreground/90">
            Activate the 6-week muscle-building programme to load Workouts 1–3,
            HIIT days and rest days onto your plan.
          </p>
          <button
            type="button"
            disabled={activatingProgramme}
            onClick={() => void handleActivateProgramme()}
            className="mt-3 min-h-11 rounded-full bg-white/10 px-4 py-2.5 text-[14px] disabled:opacity-60"
          >
            {activatingProgramme ? "Activating…" : "Activate programme"}
          </button>
        </section>
      )}

      <nav
        aria-label="Week navigation"
        className="mb-8 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="shrink-0 text-[13px] text-muted transition-colors hover:text-foreground"
            onClick={() => goToWeek(shiftWeek(selectedWeekDate, -1))}
          >
            ← Prev
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate text-[14px] font-medium text-foreground">
              {weekLabel}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-muted">
              {weekRelation === "current"
                ? "This week"
                : weekRelation === "future"
                  ? "Upcoming"
                  : "Past week"}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-[13px] text-muted transition-colors hover:text-foreground"
            onClick={() => goToWeek(shiftWeek(selectedWeekDate, 1))}
          >
            Next →
          </button>
        </div>
        {!isSameWeek(selectedWeekDate, today) ? (
          <button
            type="button"
            className="self-center text-[13px] text-foreground/90 underline-offset-4 hover:underline"
            onClick={() => goToWeek(today)}
          >
            This week
          </button>
        ) : null}
      </nav>

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

      {viewingCurrentWeek && data && data.pendingProposals.length > 0 ? (
        <section className="mb-8 space-y-3">
          {data.pendingProposals.map((proposal) => (
            <PlanProposalCard
              key={proposal.id}
              proposal={proposal}
              onResolved={() => void refresh(selectedWeekDate)}
            />
          ))}
        </section>
      ) : null}

      {/* 1. Today's workout — current week only */}
      {viewingCurrentWeek ? (
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
                  onClick={openUnplannedLog}
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
                const linked = findLinkedSession(plan);

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
                  onClick={openUnplannedLog}
                >
                  + Log an unplanned workout
                </button>
              </li>
            </ul>
          )}
        </section>
      ) : null}

      {/* 2. Weekly progress — scoped to selected week */}
      {weekProgress ? (
        <section className="mb-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              {weekRelation === "future"
                ? "Week overview"
                : "Weekly progress"}
            </h2>
            {viewingCurrentWeek ? (
              <button
                type="button"
                className="text-[12px] text-muted transition-colors hover:text-foreground"
                onClick={() => setEditingWeekTarget((value) => !value)}
              >
                {editingWeekTarget ? "Cancel" : "Edit target"}
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-muted">{weekLabel}</p>

          {editingWeekTarget && viewingCurrentWeek ? (
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
            {weekRelation === "future" ? (
              <div className="rounded-2xl border border-border/70 px-4 py-3">
                <p className="text-[14px] text-foreground">
                  {weekProgress.plannedSessions} session
                  {weekProgress.plannedSessions === 1 ? "" : "s"} planned
                  {weekProgress.restDays
                    ? ` · ${weekProgress.restDays} rest`
                    : ""}
                </p>
                <p className="mt-1 text-[12px] text-muted">
                  Completion tracking starts once this week begins.
                </p>
              </div>
            ) : (
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
            )}
            {weekRelation !== "future" && weekProgress.unplannedSessions > 0 ? (
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
          {weekRelation === "future" ? "Plan ahead" : "Weekly plan"}
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
                    {entries.map((entry) => {
                      const linked = findLinkedSession(entry);
                      return (
                        <li key={entry.id} className="space-y-1.5">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-[13px] leading-5 text-muted">
                              {entry.training_type === "rest"
                                ? "Rest"
                                : `${labelForTrainingType(entry.training_type)} · ${entry.title}`}
                              {entry.focus ? ` · ${entry.focus}` : ""}
                              {entry.planned_duration_minutes
                                ? ` · ${labelForDuration(entry.planned_duration_minutes)}`
                                : ""}
                              {weekRelation !== "future"
                                ? ` · ${statusLabel(entry.status)}`
                                : ""}
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
                          </div>
                          {weekRelation !== "future" &&
                          entry.training_type !== "rest" &&
                          entry.status === "planned" ? (
                            <button
                              type="button"
                              className="text-[12px] text-foreground/90 underline-offset-2 hover:underline"
                              onClick={() => openComplete(entry)}
                            >
                              Mark as complete
                            </button>
                          ) : null}
                          {entry.status === "completed" && linked ? (
                            <button
                              type="button"
                              className="text-[12px] text-muted underline-offset-2 hover:underline"
                              onClick={() =>
                                setMode({
                                  kind: "compare",
                                  plan: entry,
                                  session: linked,
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
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 4. Steps — current week only */}
      {viewingCurrentWeek ? (
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
      ) : null}

      {/* 5. Recent — current week context */}
      {viewingCurrentWeek && data && data.recentSessions.length > 0 ? (
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
            onClick={openUnplannedLog}
          >
            + Log workout
          </button>
        </section>
      ) : viewingCurrentWeek ? (
        <button
          type="button"
          className="text-[14px] text-foreground/90 underline-offset-4 hover:underline"
          onClick={openUnplannedLog}
        >
          + Log workout
        </button>
      ) : null}
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
