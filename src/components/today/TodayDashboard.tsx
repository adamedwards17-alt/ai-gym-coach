"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { startMealInspirationChat } from "@/app/actions/coach";
import { stopNutritionHabit } from "@/app/actions/nutrition";
import {
  loadTodayDashboard,
  type TodayDashboardData,
} from "@/app/actions/today-dashboard";
import { NutritionProgressBars } from "@/components/nutrition/NutritionProgressBars";
import { MorningCheckIn } from "@/components/today/MorningCheckIn";
import {
  formatSleepHoursLabel,
  getLocalCheckInDate,
  hydrateCheckInForUi,
  toTodayCheckInState,
} from "@/lib/check-ins";
import { getLocalCoachDate } from "@/lib/coach";
import { resolveCoachMoment, type CoachMoment } from "@/lib/coach-moment";
import { detectFoodHabits, type DetectedHabit } from "@/lib/food-habits";
import {
  markHabitPrompted,
  readPromptedHabitKeys,
} from "@/lib/habit-session";
import { entryDisplayTitle } from "@/lib/nutrition";
import { resolveNextAction, type NextAction } from "@/lib/next-action";
import { writePendingFoodLog } from "@/lib/pending-food-log";
import { getDisplayName } from "@/lib/profile";
import {
  greetingForHour,
  labelForPlan,
  labelForSleepQuality,
  type TodayCheckIn,
} from "@/lib/today";
import {
  labelForDuration,
  labelForTrainingType,
} from "@/lib/training";

type Panel = "dashboard" | "check-in";

type TodayDashboardProps = {
  displayName: string;
};

function NutritionSection({
  data,
  now,
}: {
  data: TodayDashboardData;
  now: Date;
}) {
  const summary = data.nutrition;
  if (!summary) {
    return null;
  }

  if (summary.targetsStatus !== "ok" || !summary.targets) {
    return (
      <section className="today-reveal">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Nutrition
          </h2>
          <Link
            href="/nutrition"
            className="text-[13px] text-muted transition-colors hover:text-foreground"
          >
            Open Nutrition
          </Link>
        </div>
        <p className="mt-4 text-[15px] leading-7 text-muted">
          {summary.targetsMessage ??
            "Complete your profile to unlock calorie and macro targets."}
        </p>
        <Link
          href="/nutrition"
          className="mt-4 inline-flex text-[14px] text-foreground/90 underline-offset-4 hover:underline"
        >
          + Add food
        </Link>
      </section>
    );
  }

  return (
    <section className="today-reveal">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Nutrition
        </h2>
        <Link
          href="/nutrition"
          className="text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Full day
        </Link>
      </div>

      <div className="mt-5">
        <NutritionProgressBars summary={summary} now={now} compact />
      </div>

      <Link
        href="/nutrition"
        className="mt-5 inline-flex text-[14px] text-foreground/90 underline-offset-4 hover:underline"
      >
        + Add food
      </Link>
    </section>
  );
}

function TrainingSection({ data }: { data: TodayDashboardData }) {
  const session = data.trainingSession;
  const plan = data.plannedTraining;

  let statusLine: string;
  if (session) {
    statusLine = `✓ ${labelForTrainingType(session.training_type)} completed`;
    if (session.duration_minutes) {
      statusLine += ` · ${labelForDuration(session.duration_minutes)}`;
    }
  } else if (
    plan === "strength" ||
    plan === "hiit" ||
    plan === "recovery"
  ) {
    statusLine = `${labelForPlan(plan)} · planned`;
  } else if (plan === "rest") {
    statusLine = "Rest day";
  } else {
    statusLine = "No training planned";
  }

  return (
    <section className="today-reveal">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Training
        </h2>
        <Link
          href="/train"
          className="text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Open Train
        </Link>
      </div>
      <p className="mt-4 text-[17px] leading-7 text-foreground/92">{statusLine}</p>
      <Link
        href="/train"
        className="mt-4 inline-flex text-[14px] text-foreground/90 underline-offset-4 hover:underline"
      >
        + Log workout
      </Link>
    </section>
  );
}

function RecoverySection({
  data,
  onStart,
  onEdit,
}: {
  data: TodayDashboardData;
  onStart: () => void;
  onEdit: () => void;
}) {
  if (!data.hasCheckIn || !data.checkIn) {
    return (
      <section id="check-in" className="today-reveal scroll-mt-24">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Recovery
        </h2>
        <p className="mt-4 text-[15px] leading-7 text-muted">
          No check-in yet today.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-4 text-[14px] text-foreground/90 underline-offset-4 hover:underline"
        >
          Start check-in
        </button>
      </section>
    );
  }

  const hydrated = hydrateCheckInForUi(toTodayCheckInState(data.checkIn));
  const sleepLabel = formatSleepHoursLabel(hydrated.sleepHours);
  const qualityLabel = hydrated.sleepQuality
    ? labelForSleepQuality(hydrated.sleepQuality)
    : "—";
  const feelingLabel =
    hydrated.feelingRating != null ? `${hydrated.feelingRating} / 5` : "—";

  return (
    <section id="check-in" className="today-reveal scroll-mt-24">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
        Recovery
      </h2>
      <dl className="mt-4 space-y-2 text-[15px] leading-7">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Sleep</dt>
          <dd>{sleepLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Quality</dt>
          <dd>{qualityLabel}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Feeling</dt>
          <dd>{feelingLabel}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 text-[14px] text-foreground/90 underline-offset-4 hover:underline"
      >
        Edit check-in
      </button>
    </section>
  );
}

export function TodayDashboard({ displayName }: TodayDashboardProps) {
  const router = useRouter();
  const [data, setData] = useState<TodayDashboardData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inspirationError, setInspirationError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("dashboard");
  const [now, setNow] = useState(() => new Date());
  const [inspirationPending, startInspiration] = useTransition();
  const [habitPending, startHabitAction] = useTransition();
  const [dismissedHabitKeys, setDismissedHabitKeys] = useState<string[]>([]);
  const [promptedHabitKeys, setPromptedHabitKeys] = useState<string[]>([]);
  const [habitAck, setHabitAck] = useState<string | null>(null);
  const name = getDisplayName(displayName);
  const hour = now.getHours();
  const greeting = greetingForHour(hour, name);

  const refresh = useCallback(async () => {
    const result = await loadTodayDashboard(getLocalCheckInDate());
    if (result.status === "ok") {
      setData(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.message);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void loadTodayDashboard(getLocalCheckInDate()).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "ok") {
        setData(result.data);
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

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [activeHabitMoment, setActiveHabitMoment] =
    useState<CoachMoment | null>(null);
  const [habitStorageTick, setHabitStorageTick] = useState(0);

  useEffect(() => {
    if (!data?.localDate) {
      return;
    }
    queueMicrotask(() => {
      setPromptedHabitKeys(readPromptedHabitKeys(data.localDate));
    });
  }, [data?.localDate, habitStorageTick]);

  const nextAction: NextAction | null = useMemo(() => {
    if (!data) {
      return null;
    }
    return resolveNextAction({
      now,
      hasCheckIn: data.hasCheckIn,
      plannedTraining: data.plannedTraining,
      loggedMealTypes: data.loggedMealTypes,
      hasTrainingSession: data.hasTrainingSession,
    });
  }, [data, now]);

  const detectedHabits: DetectedHabit[] = useMemo(() => {
    if (!data) {
      return [];
    }
    const localDate = data.localDate;
    // Keep the currently sticky habit visible in detection until dismissed.
    const prompted = [...promptedHabitKeys, ...dismissedHabitKeys].filter(
      (key) => key !== activeHabitMoment?.habitKey,
    );
    const todayLabels = [
      ...(data.nutrition?.eatenEntries ?? []),
      ...(data.nutrition?.plannedEntries ?? []),
    ].flatMap((entry) => [
      entryDisplayTitle(entry),
      entry.description,
      ...(entry.search_aliases ?? []),
    ]);

    return detectFoodHabits({
      entries: data.habitHistory,
      localDate,
      now,
      stoppedKeys: data.stoppedHabitKeys,
      promptedTodayKeys: prompted,
      loggedTodayLabels: todayLabels,
    });
  }, [data, now, dismissedHabitKeys, promptedHabitKeys, activeHabitMoment?.habitKey]);

  const coachMoment: CoachMoment | null = useMemo(() => {
    if (!data) {
      return null;
    }
    return resolveCoachMoment({
      now,
      hasCheckIn: data.hasCheckIn,
      plannedTraining: data.plannedTraining,
      loggedMealTypes: data.loggedMealTypes,
      hasTrainingSession: data.hasTrainingSession,
      nutrition: data.nutrition,
      detectedHabits,
    });
  }, [data, now, detectedHabits]);

  // Keep the habit sticky until answered; mark prompted so refresh won't re-ask.
  useEffect(() => {
    if (
      !coachMoment ||
      coachMoment.type !== "habit" ||
      !coachMoment.habitKey ||
      activeHabitMoment
    ) {
      return;
    }
    const localDate = data?.localDate ?? getLocalCheckInDate();
    const habit = coachMoment;
    queueMicrotask(() => {
      markHabitPrompted(localDate, habit.habitKey!);
      setActiveHabitMoment(habit);
      setHabitStorageTick((tick) => tick + 1);
    });
  }, [coachMoment, data?.localDate, activeHabitMoment]);

  const displayCoachMoment: CoachMoment | null =
    activeHabitMoment &&
    !dismissedHabitKeys.includes(activeHabitMoment.habitKey ?? "")
      ? activeHabitMoment
      : coachMoment;

  function dismissHabitForToday(habitKey: string, message?: string) {
    const localDate = data?.localDate ?? getLocalCheckInDate();
    markHabitPrompted(localDate, habitKey);
    setDismissedHabitKeys((keys) =>
      keys.includes(habitKey) ? keys : [...keys, habitKey],
    );
    setActiveHabitMoment(null);
    setHabitStorageTick((tick) => tick + 1);
    setHabitAck(message ?? null);
  }

  function handleHabitYes(moment: CoachMoment) {
    if (!moment.habitKey || !moment.habitDescription) {
      return;
    }
    const habit = detectedHabits.find((item) => item.key === moment.habitKey);
    const localDate = data?.localDate ?? getLocalCheckInDate();
    markHabitPrompted(localDate, moment.habitKey);
    setDismissedHabitKeys((keys) =>
      keys.includes(moment.habitKey!) ? keys : [...keys, moment.habitKey!],
    );
    setActiveHabitMoment(null);
    setHabitStorageTick((tick) => tick + 1);

    // Only hand off saved macros when we actually have them — never invent zeros.
    writePendingFoodLog({
      description: moment.habitDescription,
      displayName: moment.habitLabel ?? moment.habitDescription,
      mealType: moment.mealType ?? habit?.mealType ?? null,
      estimate:
        habit?.sampleCalories != null
          ? {
              calories: Math.round(habit.sampleCalories),
              proteinG: Math.round(habit.sampleProteinG ?? 0),
              carbsG: Math.round(habit.sampleCarbsG ?? 0),
              fatG: Math.round(habit.sampleFatG ?? 0),
              confidence: "medium",
              source: "user",
              displayName: moment.habitLabel ?? null,
              items: [],
            }
          : null,
      brand: null,
      barcode: null,
    });
    const meal = moment.mealType ? `?meal=${moment.mealType}` : "";
    router.push(`/nutrition${meal}`);
  }

  function handleHabitNo(moment: CoachMoment) {
    if (!moment.habitKey) {
      return;
    }
    dismissHabitForToday(
      moment.habitKey,
      "Got it — won’t ask about that again today.",
    );
  }

  function handleHabitStopped(moment: CoachMoment) {
    if (!moment.habitKey) {
      return;
    }
    startHabitAction(async () => {
      const result = await stopNutritionHabit({ habitKey: moment.habitKey! });
      if (result.status === "stopped") {
        setData((current) =>
          current
            ? {
                ...current,
                stoppedHabitKeys: current.stoppedHabitKeys.includes(
                  moment.habitKey!,
                )
                  ? current.stoppedHabitKeys
                  : [...current.stoppedHabitKeys, moment.habitKey!],
              }
            : current,
        );
        dismissHabitForToday(
          moment.habitKey!,
          "Understood — I won’t prompt for that habit anymore.",
        );
      } else {
        setInspirationError(result.message);
      }
    });
  }

  const editInitial: TodayCheckIn | null = useMemo(() => {
    if (!data?.checkIn) {
      return null;
    }
    return hydrateCheckInForUi(toTodayCheckInState(data.checkIn));
  }, [data]);

  function handleNeedInspiration() {
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

  function handleCheckInCompleted(
    _checkIn: TodayCheckIn,
    coachTakeText: string | null,
  ) {
    setPanel("dashboard");
    void refresh().then(() => {
      if (coachTakeText) {
        setData((current) =>
          current
            ? {
                ...current,
                coachTake: coachTakeText,
                hasCheckIn: true,
              }
            : current,
        );
      }
    });
  }

  if (!ready) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">Loading…</p>
    );
  }

  if (panel === "check-in") {
    return (
      <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
        <MorningCheckIn
          displayName={displayName}
          initialCheckIn={
            data?.hasCheckIn ? editInitial : null
          }
          onCompleted={handleCheckInCompleted}
          onCancel={data?.hasCheckIn ? () => setPanel("dashboard") : undefined}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <header className="mb-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Today
        </p>
        <h1 className="mt-3 font-serif text-[2.15rem] leading-tight tracking-tight sm:text-5xl">
          {greeting}
        </h1>
        <p className="mt-3 text-[15px] leading-7 text-muted">
          Here’s what matters next.
        </p>
      </header>

      {loadError ? (
        <p role="alert" className="mb-6 text-[13px] leading-6 text-muted">
          {loadError}
        </p>
      ) : null}

      {nextAction ? (
        <section className="today-reveal relative mb-10 overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/[0.09] via-white/[0.03] to-transparent px-5 py-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Your next step
          </p>
          <h2 className="mt-3 font-serif text-[1.65rem] leading-tight tracking-tight">
            {nextAction.title}
          </h2>
          <p className="mt-2 text-[14px] leading-6 text-muted">
            {nextAction.description}
          </p>
          {nextAction.type === "morning_check_in" ? (
            <button
              type="button"
              onClick={() => setPanel("check-in")}
              className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/18 bg-white/10 px-5 text-[14px] text-foreground transition-colors hover:bg-white/14"
            >
              {nextAction.action.label}
            </button>
          ) : (
            <Link
              href={nextAction.action.href}
              className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/18 bg-white/10 px-5 text-[14px] text-foreground transition-colors hover:bg-white/14"
            >
              {nextAction.action.label}
            </Link>
          )}
        </section>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-11">
          <NutritionSection data={data} now={now} />
          <TrainingSection data={data} />
          <RecoverySection
            data={data}
            onStart={() => setPanel("check-in")}
            onEdit={() => setPanel("check-in")}
          />

          {habitAck ? (
            <p className="today-reveal text-[14px] leading-6 text-muted">
              {habitAck}
            </p>
          ) : null}

          {displayCoachMoment ? (
            <section className="today-reveal">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
                Coach
              </h2>
              <p className="mt-4 font-serif text-[1.45rem] leading-snug tracking-tight text-foreground">
                {displayCoachMoment.title}
              </p>
              {displayCoachMoment.description ? (
                <p className="mt-2 text-[14px] leading-6 text-muted">
                  {displayCoachMoment.description}
                </p>
              ) : null}

              {displayCoachMoment.type === "habit" ? (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={habitPending}
                      onClick={() => handleHabitYes(displayCoachMoment)}
                      className="inline-flex min-h-10 items-center rounded-full bg-foreground px-4 text-[13px] font-medium text-background disabled:opacity-60"
                    >
                      Yes — log it
                    </button>
                    <button
                      type="button"
                      disabled={habitPending}
                      onClick={() => handleHabitNo(displayCoachMoment)}
                      className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-60"
                    >
                      Not today
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={habitPending}
                    onClick={() => handleHabitStopped(displayCoachMoment)}
                    className="w-fit text-[12px] text-muted transition-colors hover:text-foreground disabled:opacity-60"
                  >
                    I don’t have this habit anymore
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {displayCoachMoment.type === "morning_check_in" ? (
                    <button
                      type="button"
                      onClick={() => setPanel("check-in")}
                      className="text-[14px] text-foreground/90 underline-offset-4 hover:underline"
                    >
                      Start check-in
                    </button>
                  ) : null}
                  {displayCoachMoment.type === "breakfast" ||
                  displayCoachMoment.type === "lunch" ||
                  displayCoachMoment.type === "snack" ||
                  displayCoachMoment.type === "dinner" ? (
                    <Link
                      href={`/nutrition?meal=${displayCoachMoment.type}`}
                      className="text-[14px] text-foreground/90 underline-offset-4 hover:underline"
                    >
                      Log {displayCoachMoment.type}
                    </Link>
                  ) : null}
                  {displayCoachMoment.showInspirationCta ? (
                    <button
                      type="button"
                      disabled={inspirationPending}
                      onClick={handleNeedInspiration}
                      className="inline-flex min-h-10 items-center rounded-full border border-border px-4 text-[13px] text-foreground transition-colors hover:border-white/16 hover:bg-white/[0.04] disabled:opacity-60"
                    >
                      {inspirationPending ? "Opening…" : "Need inspiration"}
                    </button>
                  ) : (
                    <Link
                      href="/coach"
                      className="text-[13px] text-muted transition-colors hover:text-foreground"
                    >
                      Ask Coach
                    </Link>
                  )}
                </div>
              )}
              {inspirationError ? (
                <p role="alert" className="mt-3 text-[13px] text-muted">
                  {inspirationError}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="today-reveal border-t border-border/70 pt-8">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              Quick actions
            </h2>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3 text-[14px]">
              <Link
                href="/nutrition"
                className="text-foreground/90 underline-offset-4 hover:underline"
              >
                + Add food
              </Link>
              <Link
                href="/train"
                className="text-foreground/90 underline-offset-4 hover:underline"
              >
                + Log workout
              </Link>
              <Link
                href="/coach"
                className="text-foreground/90 underline-offset-4 hover:underline"
              >
                Ask Coach
              </Link>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
