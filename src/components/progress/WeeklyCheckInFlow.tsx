"use client";

import { useEffect, useState, useTransition } from "react";
import {
  loadWeeklyCheckInBundle,
  respondWeeklyCheckInProposal,
  saveWeeklyCheckInDraft,
  type WeeklyCheckInBundle,
} from "@/app/actions/weekly-check-in";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import {
  adherenceOptions,
  contextTagOptions,
  ratingLabels,
  recoveryOptions,
  type AdherenceLevel,
  type RecoveryFeeling,
} from "@/lib/weekly-check-ins";
import { formatWeightTrend } from "@/lib/weight-measurements";

type Step =
  | "weight"
  | "hunger"
  | "energy"
  | "mood"
  | "adherence"
  | "recovery"
  | "context"
  | "result";

type WeeklyCheckInFlowProps = {
  onClose: () => void;
  onCompleted?: () => void;
};

export function WeeklyCheckInFlow({
  onClose,
  onCompleted,
}: WeeklyCheckInFlowProps) {
  const [bundle, setBundle] = useState<WeeklyCheckInBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>("weight");

  const [weightKg, setWeightKg] = useState("");
  const [weightConfirmed, setWeightConfirmed] = useState(false);
  const [skipWeight, setSkipWeight] = useState(false);
  const [hunger, setHunger] = useState<number | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [nutritionAdherence, setNutritionAdherence] =
    useState<AdherenceLevel | null>(null);
  const [trainingAdherence, setTrainingAdherence] =
    useState<AdherenceLevel | null>(null);
  const [recovery, setRecovery] = useState<RecoveryFeeling | null>(null);
  const [contextNotes, setContextNotes] = useState("");
  const [contextTags, setContextTags] = useState<string[]>([]);
  const [checkInId, setCheckInId] = useState<string | null>(null);

  useEffect(() => {
    startTransition(async () => {
      const result = await loadWeeklyCheckInBundle();
      if (result.status !== "ok") {
        setError(result.message);
        return;
      }
      setBundle(result.data);
      const existing = result.data.checkIn;
      if (existing) {
        setCheckInId(existing.id);
        if (existing.weight_kg != null) {
          setWeightKg(String(existing.weight_kg));
          setWeightConfirmed(existing.weight_confirmed);
        } else if (result.data.latestWeightKg != null) {
          setWeightKg(String(result.data.latestWeightKg));
        }
        setHunger(existing.hunger_rating);
        setEnergy(existing.energy_rating);
        setMood(existing.mood_rating);
        setNutritionAdherence(existing.nutrition_adherence);
        setTrainingAdherence(existing.training_adherence);
        setRecovery(existing.recovery_feeling);
        setContextNotes(existing.context_notes ?? "");
        setContextTags(existing.context_tags);
        if (existing.status === "completed") {
          setStep("result");
        }
      } else if (result.data.latestWeightKg != null) {
        setWeightKg(String(result.data.latestWeightKg));
      }
    });
  }, []);

  function persist(
    complete: boolean,
    nextStep?: Step,
    overrides?: {
      skipWeight?: boolean;
      weightConfirmed?: boolean;
      weightKg?: string;
    },
  ) {
    if (!bundle) {
      return;
    }
    const skip = overrides?.skipWeight ?? skipWeight;
    const confirmed = overrides?.weightConfirmed ?? weightConfirmed;
    const weightValue = overrides?.weightKg ?? weightKg;
    setError(null);
    startTransition(async () => {
      const result = await saveWeeklyCheckInDraft({
        checkInId,
        weekStart: bundle.weekStart,
        weightKg: skip || !weightValue ? null : Number(weightValue),
        weightConfirmed: skip ? false : confirmed,
        hungerRating: hunger,
        energyRating: energy,
        moodRating: mood,
        nutritionAdherence,
        trainingAdherence,
        recoveryFeeling: recovery,
        contextNotes,
        contextTags,
        complete,
      });
      if (result.status !== "saved") {
        setError(result.message);
        return;
      }
      setCheckInId(result.checkIn.id);
      setBundle((current) =>
        current ? { ...current, checkIn: result.checkIn } : current,
      );
      if (complete) {
        setStep("result");
        onCompleted?.();
      } else if (nextStep) {
        setStep(nextStep);
      }
    });
  }

  function respondProposal(accept: boolean) {
    if (!checkInId) {
      return;
    }
    startTransition(async () => {
      const result = await respondWeeklyCheckInProposal({
        checkInId,
        accept,
      });
      if (result.status !== "saved") {
        setError(result.message);
        return;
      }
      setBundle((current) =>
        current ? { ...current, checkIn: result.checkIn } : current,
      );
    });
  }

  if (!bundle && !error) {
    return (
      <p className="px-5 py-12 text-center text-[13px] text-muted">Loading…</p>
    );
  }

  if (error && !bundle) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-[14px] text-muted">{error}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-[14px] underline-offset-4 hover:underline"
        >
          Back
        </button>
      </div>
    );
  }

  const checkIn = bundle?.checkIn ?? null;
  const trendLabel = formatWeightTrend(bundle?.weightTrendKg ?? null);

  return (
    <div className="mx-auto w-full max-w-lg px-5 py-6 sm:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-[1.75rem] tracking-tight">
          Weekly check-in
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] text-muted hover:text-foreground"
        >
          Close
        </button>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        Week of {bundle?.weekStart} · about two minutes
      </p>

      {step === "weight" ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>
            {bundle?.latestWeightKg != null
              ? `Your latest recorded weight is ${bundle.latestWeightKg} kg${
                  bundle.latestWeightDate
                    ? ` (${bundle.latestWeightDate})`
                    : ""
                }.${trendLabel ? ` ${trendLabel}.` : ""} Confirm it, enter a new measurement, or skip this week.`
              : "No recent weight on file. Want to record one, or skip for now?"}
          </CoachMessage>
          {!skipWeight ? (
            <label className="block">
              <span className="mb-1.5 block text-[13px] text-muted">
                Weight (kg)
              </span>
              <input
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => {
                  setWeightKg(e.target.value);
                  setWeightConfirmed(true);
                }}
                className="w-full min-h-11 rounded-[0.85rem] border border-border bg-transparent px-3.5 py-2.5 text-[15px]"
              />
            </label>
          ) : null}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={pending || skipWeight || !weightKg}
              onClick={() => {
                setWeightConfirmed(true);
                setSkipWeight(false);
                persist(false, "hunger", {
                  skipWeight: false,
                  weightConfirmed: true,
                  weightKg,
                });
              }}
              className="min-h-11 rounded-full bg-white/10 px-4 py-2.5 text-[14px]"
            >
              {bundle?.latestWeightKg != null &&
              Number(weightKg) === bundle.latestWeightKg
                ? "Confirm latest weight"
                : "Save weight & continue"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setSkipWeight(true);
                setWeightConfirmed(false);
                persist(false, "hunger", {
                  skipWeight: true,
                  weightConfirmed: false,
                });
              }}
              className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px]"
            >
              Skip weight this week
            </button>
          </div>
        </section>
      ) : null}

      {step === "hunger" ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>
            How hungry have you felt over the past week?
          </CoachMessage>
          <OptionSelector
            name="hunger"
            options={ratingLabels.map((r) => ({
              id: r.value,
              label: r.label,
            }))}
            value={hunger}
            onChange={setHunger}
          />
          <NavButtons
            pending={pending}
            onBack={() => setStep("weight")}
            onNext={() => persist(false, "energy")}
          />
        </section>
      ) : null}

      {step === "energy" ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>How have your energy levels been?</CoachMessage>
          <OptionSelector
            name="energy"
            options={ratingLabels.map((r) => ({
              id: r.value,
              label: r.label,
            }))}
            value={energy}
            onChange={setEnergy}
          />
          <NavButtons
            pending={pending}
            onBack={() => setStep("hunger")}
            onNext={() => persist(false, "mood")}
          />
        </section>
      ) : null}

      {step === "mood" ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>
            Optional — how’s your general mood been this week?
          </CoachMessage>
          <OptionSelector
            name="mood"
            options={ratingLabels.map((r) => ({
              id: r.value,
              label: r.label,
            }))}
            value={mood}
            onChange={setMood}
          />
          <NavButtons
            pending={pending}
            onBack={() => setStep("energy")}
            onNext={() => persist(false, "adherence")}
            nextLabel="Continue"
          />
        </section>
      ) : null}

      {step === "adherence" ? (
        <section className="mt-8 space-y-5">
          <CoachMessage>
            How consistently did you follow the plan?
          </CoachMessage>
          <div>
            <p className="mb-2 text-[13px] text-muted">Nutrition</p>
            <OptionSelector
              name="nutrition-adherence"
              options={adherenceOptions}
              value={nutritionAdherence}
              onChange={setNutritionAdherence}
            />
          </div>
          <div>
            <p className="mb-2 text-[13px] text-muted">Training</p>
            <OptionSelector
              name="training-adherence"
              options={adherenceOptions}
              value={trainingAdherence}
              onChange={setTrainingAdherence}
            />
          </div>
          <NavButtons
            pending={pending}
            onBack={() => setStep("mood")}
            onNext={() => persist(false, "recovery")}
          />
        </section>
      ) : null}

      {step === "recovery" ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>How did training and recovery feel?</CoachMessage>
          <OptionSelector
            name="recovery"
            options={recoveryOptions}
            value={recovery}
            onChange={setRecovery}
          />
          <NavButtons
            pending={pending}
            onBack={() => setStep("adherence")}
            onNext={() => persist(false, "context")}
          />
        </section>
      ) : null}

      {step === "context" ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>
            Anything affecting consistency this week? Optional.
          </CoachMessage>
          <div className="flex flex-wrap gap-2">
            {contextTagOptions.map((tag) => {
              const selected = contextTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setContextTags((current) =>
                      selected
                        ? current.filter((id) => id !== tag.id)
                        : [...current, tag.id],
                    )
                  }
                  className={`min-h-11 rounded-full border px-4 py-2.5 text-[14px] ${
                    selected
                      ? "border-white/20 bg-white/8"
                      : "border-border text-muted"
                  }`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={contextNotes}
            onChange={(e) => setContextNotes(e.target.value)}
            rows={3}
            placeholder="Anything else worth noting…"
            className="w-full rounded-[0.85rem] border border-border bg-transparent px-3.5 py-2.5 text-[15px]"
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => persist(true)}
              className="min-h-11 rounded-full bg-white/10 px-4 py-2.5 text-[14px]"
            >
              {pending ? "Saving…" : "Finish check-in"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => persist(false)}
              className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px]"
            >
              Save draft for later
            </button>
            <button
              type="button"
              onClick={() => setStep("recovery")}
              className="text-[13px] text-muted"
            >
              Back
            </button>
          </div>
        </section>
      ) : null}

      {step === "result" && checkIn ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>
            {checkIn.recommendation_text ??
              checkIn.coach_summary ??
              "Check-in saved"}
          </CoachMessage>
          {checkIn.proposal_status === "pending" &&
          checkIn.proposed_daily_calories != null ? (
            <div className="space-y-3 rounded-2xl border border-border/80 p-4">
              <p className="text-[14px] leading-6 text-foreground/90">
                Current: {bundle?.currentCalories ?? "—"} kcal
                <br />
                Proposed: {checkIn.proposed_daily_calories} kcal
                {bundle?.currentCalories != null
                  ? ` (${
                      checkIn.proposed_daily_calories - bundle.currentCalories >
                      0
                        ? "+"
                        : ""
                    }${
                      checkIn.proposed_daily_calories - bundle.currentCalories
                    })`
                  : ""}
                <br />
                Macros: {checkIn.proposed_protein_g}g /{" "}
                {checkIn.proposed_carbs_g}g / {checkIn.proposed_fat_g}g
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => respondProposal(true)}
                  className="min-h-11 rounded-full bg-white/10 px-4 py-2.5 text-[14px]"
                >
                  Accept changes
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => respondProposal(false)}
                  className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px]"
                >
                  Keep my current plan
                </button>
              </div>
            </div>
          ) : null}
          {checkIn.proposal_status === "accepted" ? (
            <p className="text-[13px] text-muted">Targets updated.</p>
          ) : null}
          {checkIn.proposal_status === "rejected" ? (
            <p className="text-[13px] text-muted">
              Current plan kept — no changes applied.
            </p>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-full border border-border px-4 py-2.5 text-[14px]"
          >
            Back to Progress
          </button>
        </section>
      ) : null}

      {error ? (
        <p className="mt-4 text-center text-[13px] text-red-300/90">{error}</p>
      ) : null}
    </div>
  );
}

function NavButtons({
  pending,
  onBack,
  onNext,
  nextLabel = "Continue",
}: {
  pending: boolean;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  return (
    <div className="flex gap-2 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 flex-1 rounded-full border border-border px-4 py-2.5 text-[14px]"
      >
        Back
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={onNext}
        className="min-h-11 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-[14px]"
      >
        {nextLabel}
      </button>
    </div>
  );
}
