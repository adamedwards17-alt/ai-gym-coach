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
import { buttonClassName } from "@/components/ui/Button";
import {
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  StatusBadge,
} from "@/components/ui/surfaces";
import { MorningCheckIn } from "@/components/today/MorningCheckIn";
import { MorningRecapPanel } from "@/components/today/MorningRecapPanel";
import { TodayActionBanners } from "@/components/today/TodayActionBanners";
import {
  formatSleepHoursLabel,
  getLocalCheckInDate,
  hydrateCheckInForUi,
  toTodayCheckInState,
} from "@/lib/check-ins";
import {
  markBannerDismissed,
  readDismissedBannerIds,
} from "@/lib/banner-session";
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
  labelForSleepQuality,
  type TodayCheckIn,
} from "@/lib/today";
import {
  resolveTodayActionBanners,
  type TodayActionBanner,
} from "@/lib/today-action-banners";
import { buildTodayCoachingSummary } from "@/lib/today-coaching-summary";
import { statusLabel as planStatusLabel } from "@/lib/training-plan";
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
      <Card className="today-reveal">
        <SectionTitle
          action={
            <Link href="/nutrition" className="text-[13px] text-primary">
              Open
            </Link>
          }
        >
          Nutrition
        </SectionTitle>
        <EmptyState>
          {summary.targetsMessage ??
            "Complete your profile to unlock calorie and macro targets."}
        </EmptyState>
        <Link href="/nutrition" className={`${buttonClassName()} mt-4`}>
          Add food
        </Link>
      </Card>
    );
  }

  const foods = [...summary.eatenEntries, ...summary.plannedEntries].slice(0, 4);

  return (
    <section className="today-reveal flex flex-col gap-3">
      <SectionTitle
        action={
          <Link href="/nutrition" className="text-[13px] font-medium text-primary">
            Full day
          </Link>
        }
      >
        Nutrition
      </SectionTitle>
      <NutritionProgressBars summary={summary} now={now} compact />
      <Card>
        {foods.length > 0 ? (
          <ul className="divide-y divide-border">
            {foods.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 py-2 text-[14px] text-foreground"
              >
                <span className="min-w-0 truncate">{entryDisplayTitle(entry)}</span>
                {entry.status === "planned" ? (
                  <StatusBadge>Planned</StatusBadge>
                ) : (
                  <StatusBadge tone="done">Eaten</StatusBadge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Nothing logged yet.</EmptyState>
        )}
        <Link href="/nutrition" className={`${buttonClassName()} mt-3`}>
          Add food
        </Link>
      </Card>
    </section>
  );
}

function TrainingSection({ data }: { data: TodayDashboardData }) {
  const entries = data.todayPlanEntries;

  return (
    <Card className="today-reveal">
      <SectionTitle
        action={
          <Link href="/train" className="text-[13px] font-medium text-primary">
            Open Train
          </Link>
        }
      >
        Training
      </SectionTitle>
      {entries.length === 0 ? (
        <EmptyState>No session on the plan today.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {entries.map((entry) => {
            const done = entry.status === "completed";
            return (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-foreground">
                    {entry.training_type === "rest" ? "Rest day" : entry.title}
                  </p>
                  <p className="text-[12px] text-muted">
                    {entry.training_type === "rest"
                      ? "Recovery"
                      : labelForTrainingType(entry.training_type)}
                    {entry.planned_duration_minutes
                      ? ` · ${labelForDuration(entry.planned_duration_minutes)}`
                      : ""}
                  </p>
                </div>
                <StatusBadge tone={done ? "done" : "open"}>
                  {planStatusLabel(entry.status)}
                </StatusBadge>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/train"
        className={`${buttonClassName()} mt-3`}
      >
        {data.hasIncompletePlannedTraining ? "Start workout" : "Log workout"}
      </Link>
    </Card>
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
      <Card id="check-in" className="today-reveal scroll-mt-24">
        <SectionTitle>Check-in</SectionTitle>
        <EmptyState>No check-in yet today.</EmptyState>
        <button type="button" onClick={onStart} className={`${buttonClassName()} mt-3`}>
          Start check-in
        </button>
      </Card>
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
    <Card id="check-in" className="today-reveal scroll-mt-24">
      <SectionTitle>Check-in</SectionTitle>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-background px-2 py-2">
          <dt className="text-[11px] text-muted">Sleep</dt>
          <dd className="mt-0.5 text-[14px] font-semibold text-foreground">{sleepLabel}</dd>
        </div>
        <div className="rounded-xl bg-background px-2 py-2">
          <dt className="text-[11px] text-muted">Quality</dt>
          <dd className="mt-0.5 text-[14px] font-semibold text-foreground">{qualityLabel}</dd>
        </div>
        <div className="rounded-xl bg-background px-2 py-2">
          <dt className="text-[11px] text-muted">Feeling</dt>
          <dd className="mt-0.5 text-[14px] font-semibold text-foreground">{feelingLabel}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onEdit}
        className={`${buttonClassName("secondary")} mt-3`}
      >
        Edit check-in
      </button>
    </Card>
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
  const [dismissedBannerIds, setDismissedBannerIds] = useState<string[]>([]);
  const [bannerStorageTick, setBannerStorageTick] = useState(0);
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
      setDismissedBannerIds(readDismissedBannerIds(data.localDate));
    });
  }, [data?.localDate, habitStorageTick, bannerStorageTick]);

  const nextAction: NextAction | null = useMemo(() => {
    if (!data) {
      return null;
    }
    return resolveNextAction({
      now,
      hasCheckIn: data.hasCheckIn,
      plannedTraining: data.plannedTraining,
      loggedMealTypes: data.loggedMealTypes,
      hasTrainingSession:
        data.hasTrainingSession && !data.hasIncompletePlannedTraining,
    });
  }, [data, now]);

  const mealInspirationAction =
    nextAction &&
    (nextAction.type === "breakfast" ||
      nextAction.type === "lunch" ||
      nextAction.type === "snack" ||
      nextAction.type === "dinner")
      ? nextAction
      : null;

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
      hasTrainingSession:
        data.hasTrainingSession && !data.hasIncompletePlannedTraining,
      nutrition: data.nutrition,
      detectedHabits,
    });
  }, [data, now, detectedHabits]);

  const actionBanners: TodayActionBanner[] = useMemo(() => {
    if (!data) {
      return [];
    }
    return resolveTodayActionBanners({
      now,
      hasCheckIn: data.hasCheckIn,
      plannedTraining: data.plannedTraining,
      loggedMealTypes: data.loggedMealTypes,
      hasTrainingSession:
        data.hasTrainingSession && !data.hasIncompletePlannedTraining,
      nutrition: data.nutrition,
      detectedHabits,
      planEntries: data.todayPlanEntries,
      dismissedIds: dismissedBannerIds,
      maxBanners: 2,
    });
  }, [data, now, detectedHabits, dismissedBannerIds]);

  const coachingSummary = useMemo(() => {
    if (!data) {
      return null;
    }
    const hasTrainingBanner = actionBanners.some(
      (banner) => banner.kind === "training",
    );
    return buildTodayCoachingSummary({
      planEntries: data.todayPlanEntries,
      nutrition: data.nutrition,
      feeling: data.checkIn?.feeling ?? null,
      suppressTrainingReminder: hasTrainingBanner,
    });
  }, [data, actionBanners]);

  // Keep the habit sticky until answered; mark prompted so refresh won't re-ask.
  // Skip sticky habit UI when the habit is already surfaced as an action banner.
  useEffect(() => {
    if (
      !coachMoment ||
      coachMoment.type !== "habit" ||
      !coachMoment.habitKey ||
      activeHabitMoment
    ) {
      return;
    }
    if (
      actionBanners.some(
        (banner) =>
          banner.kind === "habit" && banner.habitKey === coachMoment.habitKey,
      )
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
  }, [coachMoment, data?.localDate, activeHabitMoment, actionBanners]);

  const displayCoachMoment: CoachMoment | null =
    activeHabitMoment &&
    !dismissedHabitKeys.includes(activeHabitMoment.habitKey ?? "")
      ? activeHabitMoment
      : coachMoment &&
          !actionBanners.some(
            (banner) =>
              banner.kind === "habit" &&
              banner.habitKey === coachMoment.habitKey,
          )
        ? coachMoment
        : null;

  function dismissBanner(bannerId: string) {
    const localDate = data?.localDate ?? getLocalCheckInDate();
    markBannerDismissed(localDate, bannerId);
    setDismissedBannerIds((ids) =>
      ids.includes(bannerId) ? ids : [...ids, bannerId],
    );
    setBannerStorageTick((tick) => tick + 1);
    // Habit dismissals also suppress the sticky habit prompt for today.
    if (bannerId.startsWith("habit:")) {
      const habitKey = bannerId.slice("habit:".length);
      markHabitPrompted(localDate, habitKey);
      setDismissedHabitKeys((keys) =>
        keys.includes(habitKey) ? keys : [...keys, habitKey],
      );
      setActiveHabitMoment(null);
      setHabitStorageTick((tick) => tick + 1);
    }
  }

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

  function logHabitFromMoment(moment: {
    habitKey?: string;
    habitDescription?: string;
    habitLabel?: string;
    mealType?: CoachMoment["mealType"];
  }) {
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
    dismissBanner(`habit:${moment.habitKey}`);

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

  function handleHabitYes(moment: CoachMoment) {
    logHabitFromMoment(moment);
  }

  function handleHabitBannerLog(banner: TodayActionBanner) {
    if (!banner.habitKey) {
      return;
    }
    const moment =
      (coachMoment?.habitKey === banner.habitKey ? coachMoment : null) ??
      (activeHabitMoment?.habitKey === banner.habitKey
        ? activeHabitMoment
        : null);
    const habit = detectedHabits.find((item) => item.key === banner.habitKey);
    logHabitFromMoment({
      habitKey: banner.habitKey,
      habitDescription:
        moment?.habitDescription ?? habit?.description ?? banner.title,
      habitLabel: moment?.habitLabel ?? habit?.label,
      mealType: moment?.mealType ?? habit?.mealType ?? null,
    });
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

  const showHabitMoment =
    displayCoachMoment?.type === "habit" ? displayCoachMoment : null;

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12">
      <PageHeader eyebrow="Today" title={greeting} />

      {loadError ? (
        <p role="alert" className="mb-6 text-[13px] leading-6 text-muted">
          {loadError}
        </p>
      ) : null}

      {data?.morningRecap ? (
        <MorningRecapPanel
          localDate={data.localDate}
          recap={data.morningRecap}
          hasCheckIn={data.hasCheckIn}
          onStartCheckIn={() => setPanel("check-in")}
        />
      ) : null}

      <TodayActionBanners
        banners={actionBanners}
        onDismiss={dismissBanner}
        onOpenCheckIn={() => setPanel("check-in")}
        onHabitLog={handleHabitBannerLog}
      />

      {data?.weeklyCheckInDue ? (
        <Card className="today-reveal mb-4">
          <p className="text-[14px] leading-6 text-foreground">
            Your weekly check-in is due — a quick review of weight, hunger and
            how the plan felt.
          </p>
          <Link
            href="/progress?checkin=1"
            className={`${buttonClassName()} mt-3`}
          >
            Start weekly check-in
          </Link>
        </Card>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-4">
          {nextAction && nextAction.type !== "all_caught_up" ? (
            <Card className="today-reveal border-primary/30">
              <SectionTitle>Next</SectionTitle>
              <p className="mt-1 text-[16px] font-semibold text-foreground">
                {nextAction.title}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                {nextAction.description}
              </p>
              {nextAction.type === "morning_check_in" ? (
                <button
                  type="button"
                  onClick={() => setPanel("check-in")}
                  className={`${buttonClassName()} mt-3`}
                >
                  {nextAction.action.label}
                </button>
              ) : (
                <Link
                  href={nextAction.action.href}
                  className={`${buttonClassName()} mt-3`}
                >
                  {nextAction.action.label}
                </Link>
              )}
            </Card>
          ) : null}

          <TrainingSection data={data} />
          <NutritionSection data={data} now={now} />
          <RecoverySection
            data={data}
            onStart={() => setPanel("check-in")}
            onEdit={() => setPanel("check-in")}
          />

          {coachingSummary ? (
            <Card className="today-reveal">
              <SectionTitle>Coach</SectionTitle>
              <div className="mt-2 space-y-2">
                {coachingSummary.sentences.map((sentence) => (
                  <p key={sentence} className="text-[15px] leading-6 text-foreground">
                    {sentence}
                  </p>
                ))}
              </div>
              <Link href="/coach" className={`${buttonClassName("secondary")} mt-3`}>
                Ask Coach
              </Link>
            </Card>
          ) : null}

          {(mealInspirationAction ||
            displayCoachMoment?.showInspirationCta) && (
            <Card className="today-reveal">
              <SectionTitle>Meal ideas</SectionTitle>
              <p className="mt-1 text-[13px] text-muted">
                {mealInspirationAction
                  ? `Ideas for ${mealInspirationAction.type}`
                  : "Ask Coach for inspiration"}
              </p>
              <button
                type="button"
                disabled={inspirationPending}
                onClick={handleNeedInspiration}
                className={`${buttonClassName("secondary")} mt-3`}
              >
                {inspirationPending ? "Opening…" : "Need inspiration"}
              </button>
            </Card>
          )}
          {inspirationError ? (
            <p role="alert" className="text-[13px] text-muted">
              {inspirationError}
            </p>
          ) : null}

          {habitAck ? (
            <p className="today-reveal text-[14px] leading-6 text-muted">
              {habitAck}
            </p>
          ) : null}

          {showHabitMoment ? (
            <Card className="today-reveal">
              <SectionTitle>Habit</SectionTitle>
              <p className="mt-2 text-[15px] leading-6 text-foreground">
                {showHabitMoment.title}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={habitPending}
                  onClick={() => handleHabitYes(showHabitMoment)}
                  className={buttonClassName()}
                >
                  Yes — log it
                </button>
                <button
                  type="button"
                  disabled={habitPending}
                  onClick={() => handleHabitNo(showHabitMoment)}
                  className={buttonClassName("secondary")}
                >
                  Not today
                </button>
              </div>
              <button
                type="button"
                disabled={habitPending}
                onClick={() => handleHabitStopped(showHabitMoment)}
                className="mt-2 w-fit text-[12px] text-muted transition-colors hover:text-foreground disabled:opacity-60"
              >
                I don’t have this habit anymore
              </button>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
