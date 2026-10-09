"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  loadProgressDashboard,
  type ProgressDashboardData,
} from "@/app/actions/progress";
import { logWeightMeasurement } from "@/app/actions/weight";
import { WeeklyCheckInFlow } from "@/components/progress/WeeklyCheckInFlow";
import { optionLabel, primaryGoalOptions } from "@/lib/onboarding";

type Panel = "dashboard" | "check-in";

export function ProgressExperience() {
  const [data, setData] = useState<ProgressDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(() => {
    if (typeof window === "undefined") {
      return "dashboard";
    }
    return new URLSearchParams(window.location.search).get("checkin") === "1"
      ? "check-in"
      : "dashboard";
  });
  const [weightInput, setWeightInput] = useState("");
  const [weightNote, setWeightNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await loadProgressDashboard();
      if (result.status !== "ok") {
        setError(result.message);
        return;
      }
      setData(result.data);
      setError(null);
      if (result.data.currentWeightKg != null) {
        setWeightInput(String(result.data.currentWeightKg));
      }
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function saveWeight() {
    if (!weightInput) {
      return;
    }
    setWeightNote(null);
    startTransition(async () => {
      const result = await logWeightMeasurement({
        weightKg: Number(weightInput),
        source: "progress",
      });
      if (result.status !== "saved") {
        setError(result.message);
        return;
      }
      setWeightNote("Weight saved.");
      refresh();
    });
  }

  if (panel === "check-in") {
    return (
      <WeeklyCheckInFlow
        onClose={() => {
          setPanel("dashboard");
          refresh();
        }}
        onCompleted={() => refresh()}
      />
    );
  }

  if (!data && !error) {
    return (
      <p className="px-5 py-16 text-center text-[13px] text-muted">Loading…</p>
    );
  }

  if (error && !data) {
    return (
      <p className="px-5 py-16 text-center text-[14px] text-muted">{error}</p>
    );
  }

  if (!data) {
    return null;
  }

  const goalLabel = data.primaryGoal
    ? optionLabel(primaryGoalOptions, data.primaryGoal)
    : null;

  const chartPoints = [...data.measurements]
    .slice(0, 14)
    .reverse();

  const minW =
    chartPoints.length > 0
      ? Math.min(...chartPoints.map((m) => m.weight_kg))
      : 0;
  const maxW =
    chartPoints.length > 0
      ? Math.max(...chartPoints.map((m) => m.weight_kg))
      : 1;
  const span = Math.max(maxW - minW, 0.5);

  return (
    <div className="mx-auto w-full max-w-lg px-5 py-8 sm:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-serif text-[2rem] leading-tight tracking-tight">
          Progress
        </h1>
        <Link
          href="/profile"
          className="text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Profile
        </Link>
      </div>
      <p className="mt-2 text-[14px] leading-6 text-muted">
        How your plan is working over time — measurements, goal and consistency.
      </p>

      {data.weeklyCheckInDue ? (
        <section className="mt-8 rounded-2xl border border-border/80 p-4">
          <p className="text-[15px] leading-6 text-foreground/92">
            Your weekly check-in is due.
          </p>
          <button
            type="button"
            onClick={() => setPanel("check-in")}
            className="mt-3 min-h-11 rounded-full bg-white/10 px-4 py-2.5 text-[14px]"
          >
            Start weekly check-in
          </button>
        </section>
      ) : (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setPanel("check-in")}
            className="text-[14px] text-foreground/90 underline-offset-4 hover:underline"
          >
            Review this week’s check-in
          </button>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Current goal
        </h2>
        <p className="mt-3 text-[16px] leading-7 text-foreground/92">
          {goalLabel ?? "No primary goal set"}
          {data.goalOwnWords ? ` — ${data.goalOwnWords}` : ""}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {data.goalStartedAt ? `Started ${formatUk(data.goalStartedAt)}` : null}
          {data.targetDate ? ` · Target ${formatUk(data.targetDate)}` : null}
          {data.targetWeightKg != null
            ? ` · Target ${data.targetWeightKg} kg`
            : null}
        </p>
        {data.nutritionTargets ? (
          <p className="mt-2 text-[13px] text-muted">
            Nutrition: {data.nutritionTargets.dailyCalories} kcal ·{" "}
            {data.nutritionTargets.proteinG}g protein
            {data.nutritionTargets.isManual ? " (manual)" : ""}
          </p>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Weight
        </h2>
        <p className="mt-3 text-[28px] font-medium tracking-tight">
          {data.currentWeightKg != null
            ? `${data.currentWeightKg} kg`
            : "No measurement yet"}
        </p>
        {data.weightTrendLabel ? (
          <p className="mt-1 text-[13px] text-muted">{data.weightTrendLabel}</p>
        ) : (
          <p className="mt-1 text-[13px] text-muted">
            Need a few weigh-ins for a trend.
          </p>
        )}

        {chartPoints.length >= 2 ? (
          <div className="mt-5 flex h-24 items-end gap-1.5">
            {chartPoints.map((point) => {
              const height = ((point.weight_kg - minW) / span) * 100;
              return (
                <div
                  key={point.id}
                  className="flex flex-1 flex-col items-center justify-end"
                  title={`${point.measured_on}: ${point.weight_kg} kg`}
                >
                  <div
                    className="w-full rounded-t-sm bg-white/25"
                    style={{ height: `${Math.max(height, 8)}%` }}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <input
            inputMode="decimal"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="kg"
            className="min-h-11 flex-1 rounded-[0.85rem] border border-border bg-transparent px-3.5 py-2.5 text-[15px]"
          />
          <button
            type="button"
            disabled={pending || !weightInput}
            onClick={saveWeight}
            className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px]"
          >
            Log
          </button>
        </div>
        {weightNote ? (
          <p className="mt-2 text-[13px] text-muted">{weightNote}</p>
        ) : null}

        {data.measurements.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {data.measurements.slice(0, 8).map((m) => (
              <li
                key={m.id}
                className="flex justify-between text-[13px] text-muted"
              >
                <span>{formatUk(m.measured_on)}</span>
                <span className="text-foreground/85">{m.weight_kg} kg</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Training this week
        </h2>
        {data.weekProgress ? (
          <p className="mt-3 text-[15px] leading-7 text-foreground/90">
            {data.weekProgress.completedSessions} of{" "}
            {data.weekProgress.target} sessions
            {data.weekProgress.achieved
              ? " · target met"
              : " · room to catch up"}
          </p>
        ) : (
          <p className="mt-3 text-[14px] text-muted">No training data yet.</p>
        )}
      </section>

      {data.latestWeeklySummary ? (
        <section className="mt-10">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
            Latest coach note
          </h2>
          <p className="mt-3 text-[14px] leading-7 text-foreground/88">
            {data.latestWeeklySummary}
          </p>
        </section>
      ) : null}

      {error ? (
        <p className="mt-6 text-center text-[13px] text-red-300/90">{error}</p>
      ) : null}
    </div>
  );
}

function formatUk(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}
