"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  loadProgressDashboard,
  type ProgressDashboardData,
} from "@/app/actions/progress";
import { logWeightMeasurement } from "@/app/actions/weight";
import { WeeklyCheckInFlow } from "@/components/progress/WeeklyCheckInFlow";
import { buttonClassName } from "@/components/ui/Button";
import {
  Card,
  EmptyState,
  MetricValue,
  PageHeader,
  SectionTitle,
} from "@/components/ui/surfaces";
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
      <PageHeader
        eyebrow="Progress"
        title="How the plan is going"
        action={
          <Link href="/profile" className="text-[13px] font-medium text-primary">
            Profile
          </Link>
        }
      />

      {data.weeklyCheckInDue ? (
        <Card className="mb-4">
          <p className="text-[15px] leading-6 text-foreground">
            Your weekly check-in is due.
          </p>
          <button
            type="button"
            onClick={() => setPanel("check-in")}
            className={`${buttonClassName()} mt-3`}
          >
            Start weekly check-in
          </button>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setPanel("check-in")}
          className={`${buttonClassName("secondary")} mb-4`}
        >
          Review this week’s check-in
        </button>
      )}

      <div className="flex flex-col gap-4">
      <Card>
        <SectionTitle>Current goal</SectionTitle>
        <p className="mt-2 text-[16px] font-semibold leading-6 text-foreground">
          {goalLabel ?? "No primary goal set"}
        </p>
        {data.goalOwnWords ? (
          <p className="mt-1 text-[14px] leading-6 text-muted">{data.goalOwnWords}</p>
        ) : null}
        <p className="mt-2 text-[13px] text-muted">
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
      </Card>

      <Card>
        <MetricValue
          label="Weight"
          value={
            data.currentWeightKg != null
              ? `${data.currentWeightKg} kg`
              : "—"
          }
          detail={
            data.weightTrendLabel ??
            (data.currentWeightKg == null
              ? "No measurement yet"
              : "Need a few weigh-ins for a trend.")
          }
        />

        {chartPoints.length >= 2 ? (
          <div className="mt-4 flex h-24 items-end gap-1.5 rounded-xl bg-background px-2 py-2">
            {chartPoints.map((point) => {
              const height = ((point.weight_kg - minW) / span) * 100;
              return (
                <div
                  key={point.id}
                  className="flex flex-1 flex-col items-center justify-end"
                  title={`${point.measured_on}: ${point.weight_kg} kg`}
                >
                  <div
                    className="w-full rounded-t-sm bg-primary-bright"
                    style={{ height: `${Math.max(height, 8)}%` }}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <input
            inputMode="decimal"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="kg"
            className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[15px]"
          />
          <button
            type="button"
            disabled={pending || !weightInput}
            onClick={saveWeight}
            className={buttonClassName()}
          >
            Log
          </button>
        </div>
        {weightNote ? (
          <p className="mt-2 text-[13px] text-muted">{weightNote}</p>
        ) : null}

        {data.measurements.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {data.measurements.slice(0, 8).map((m) => (
              <li
                key={m.id}
                className="flex justify-between py-2 text-[13px] text-muted"
              >
                <span>{formatUk(m.measured_on)}</span>
                <span className="font-medium text-foreground">{m.weight_kg} kg</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Training this week</SectionTitle>
        {data.weekProgress ? (
          <p className="mt-2 text-[20px] font-semibold tracking-tight text-foreground">
            {data.weekProgress.completedSessions}
            <span className="text-[14px] font-medium text-muted">
              {" "}
              of {data.weekProgress.target} sessions
            </span>
          </p>
        ) : (
          <EmptyState>No training data yet.</EmptyState>
        )}
        {data.weekProgress ? (
          <p className="mt-1 text-[13px] text-muted">
            {data.weekProgress.achieved ? "Target met" : "Room to catch up"}
          </p>
        ) : null}
      </Card>

      {data.latestWeeklySummary ? (
        <Card>
          <SectionTitle>Latest coach note</SectionTitle>
          <p className="mt-2 text-[14px] leading-6 text-foreground">
            {data.latestWeeklySummary}
          </p>
        </Card>
      ) : null}
      </div>

      {error ? (
        <p className="mt-6 text-center text-[13px] text-danger-text">{error}</p>
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
