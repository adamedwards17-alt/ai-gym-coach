"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadTodayDashboard,
  type TodayDashboardData,
} from "@/app/actions/today-dashboard";
import { MorningCheckIn } from "@/components/today/MorningCheckIn";
import {
  formatSleepHoursLabel,
  getLocalCheckInDate,
  hydrateCheckInForUi,
  toTodayCheckInState,
} from "@/lib/check-ins";
import { resolveNextAction, type NextAction } from "@/lib/next-action";
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

function truncateInsight(text: string, maxChars = 180): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) {
    return cleaned;
  }
  const slice = cleaned.slice(0, maxChars);
  const lastStop = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastStop > 60) {
    return slice.slice(0, lastStop + 1).trim();
  }
  return `${slice.trimEnd()}…`;
}

function NutritionSection({
  data,
}: {
  data: TodayDashboardData;
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

  const { targets, consumed, remaining } = summary;

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

      <p className="mt-5 font-serif text-[2.35rem] leading-none tracking-tight">
        {consumed.calories.toLocaleString()}
        <span className="text-[1.15rem] text-muted">
          {" "}
          / {targets.daily_calories.toLocaleString()} kcal
        </span>
      </p>
      <p className="mt-2 text-[14px] text-muted">
        {remaining.calories < 0
          ? `${Math.abs(remaining.calories).toLocaleString()} kcal over`
          : `${remaining.calories.toLocaleString()} kcal remaining`}
      </p>

      <div className="mt-6 space-y-2.5 text-[15px] leading-6">
        <p>
          Protein{" "}
          <span className="text-foreground">
            {consumed.proteinG} / {targets.protein_g}g
          </span>
        </p>
        <p>
          Carbs{" "}
          <span className="text-foreground">
            {consumed.carbsG} / {targets.carbs_g}g
          </span>
        </p>
        <p>
          Fat{" "}
          <span className="text-foreground">
            {consumed.fatG} / {targets.fat_g}g
          </span>
        </p>
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
  const [data, setData] = useState<TodayDashboardData | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("dashboard");
  const [now, setNow] = useState(() => new Date());
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

  const editInitial: TodayCheckIn | null = useMemo(() => {
    if (!data?.checkIn) {
      return null;
    }
    return hydrateCheckInForUi(toTodayCheckInState(data.checkIn));
  }, [data]);

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
          <NutritionSection data={data} />
          <TrainingSection data={data} />
          <RecoverySection
            data={data}
            onStart={() => setPanel("check-in")}
            onEdit={() => setPanel("check-in")}
          />

          {data.coachTake ? (
            <section className="today-reveal">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
                Coach insight
              </h2>
              <p className="mt-4 text-[15px] leading-7 text-foreground/90">
                {truncateInsight(data.coachTake)}
              </p>
              <Link
                href="/coach"
                className="mt-3 inline-flex text-[13px] text-muted transition-colors hover:text-foreground"
              >
                Ask Coach
              </Link>
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
