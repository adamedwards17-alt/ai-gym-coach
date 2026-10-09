"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  loadProfileGoals,
  setNutritionTargetMode,
  updateProfileGoals,
  type ProfileGoalsData,
  type UpdateProfileInput,
} from "@/app/actions/profile";
import { CoachMessage } from "@/components/today/CoachMessage";
import { OptionSelector } from "@/components/today/OptionSelector";
import {
  activityLevelOptions,
  dietOptions,
  optionLabel,
  primaryGoalOptions,
  sexOptions,
  trainingFrequencyOptions,
} from "@/lib/onboarding";

const inputClass =
  "w-full min-h-11 rounded-[0.85rem] border border-border bg-transparent px-3.5 py-2.5 text-[15px] text-foreground outline-none focus:border-white/20";

type GoalWarning = {
  shouldWarn: boolean;
  daysOnPlan: number;
  message: string | null;
};

export function ProfileGoalsExperience() {
  const [data, setData] = useState<ProfileGoalsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [goalWarning, setGoalWarning] = useState<{
    warning: GoalWarning;
    pending: UpdateProfileInput;
  } | null>(null);
  const [autoConfirm, setAutoConfirm] = useState<{
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null>(null);

  // Local form state
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<string | null>(null);
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [activityLevel, setActivityLevel] = useState<string | null>(null);
  const [trainingFrequency, setTrainingFrequency] = useState<string | null>(
    null,
  );
  const [primaryGoal, setPrimaryGoal] = useState<string | null>(null);
  const [goalOwnWords, setGoalOwnWords] = useState("");
  const [targetWeightKg, setTargetWeightKg] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [preferredUnit, setPreferredUnit] = useState<"kg" | "st">("kg");
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);
  const [foodsAvoided, setFoodsAvoided] = useState("");
  const [allergies, setAllergies] = useState("");
  const [dailyStepTarget, setDailyStepTarget] = useState("");
  const [weeklySessionTarget, setWeeklySessionTarget] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualProtein, setManualProtein] = useState("");
  const [manualCarbs, setManualCarbs] = useState("");
  const [manualFat, setManualFat] = useState("");

  function hydrate(profile: ProfileGoalsData) {
    setData(profile);
    setDisplayName(profile.displayName ?? "");
    setAge(profile.age != null ? String(profile.age) : "");
    setSex(profile.sex);
    setHeightCm(profile.heightCm != null ? String(profile.heightCm) : "");
    setWeightKg(profile.weightKg != null ? String(profile.weightKg) : "");
    setActivityLevel(profile.activityLevel);
    setTrainingFrequency(profile.trainingFrequency);
    setPrimaryGoal(profile.primaryGoal);
    setGoalOwnWords(profile.goalOwnWords ?? "");
    setTargetWeightKg(
      profile.targetWeightKg != null ? String(profile.targetWeightKg) : "",
    );
    setTargetDate(profile.targetDate ?? "");
    setPreferredUnit(profile.preferredWeightUnit ?? "kg");
    setDietaryPreferences(profile.dietaryPreferences);
    setFoodsAvoided(profile.foodsAvoided ?? "");
    setAllergies(profile.allergies ?? "");
    setDailyStepTarget(
      profile.dailyStepTarget != null ? String(profile.dailyStepTarget) : "",
    );
    setWeeklySessionTarget(
      profile.weeklySessionTarget != null
        ? String(profile.weeklySessionTarget)
        : "",
    );
    if (profile.nutritionTargets) {
      setManualCalories(String(profile.nutritionTargets.daily_calories));
      setManualProtein(String(profile.nutritionTargets.protein_g));
      setManualCarbs(String(profile.nutritionTargets.carbs_g));
      setManualFat(String(profile.nutritionTargets.fat_g));
    }
  }

  useEffect(() => {
    startTransition(async () => {
      const result = await loadProfileGoals();
      if (result.status !== "ok") {
        setError(result.message);
        return;
      }
      hydrate(result.data);
    });
  }, []);

  function buildInput(
    extra?: Partial<UpdateProfileInput>,
  ): UpdateProfileInput {
    return {
      displayName: displayName.trim() || null,
      age: age ? Number(age) : null,
      sex,
      heightCm: heightCm ? Number(heightCm) : null,
      weightKg: weightKg ? Number(weightKg) : null,
      activityLevel,
      trainingFrequency,
      primaryGoal,
      goalOwnWords: goalOwnWords.trim() || null,
      targetWeightKg: targetWeightKg ? Number(targetWeightKg) : null,
      targetDate: targetDate || null,
      preferredWeightUnit: preferredUnit,
      dietaryPreferences,
      foodsAvoided: foodsAvoided.trim() || null,
      allergies: allergies.trim() || null,
      dailyStepTarget: dailyStepTarget ? Number(dailyStepTarget) : null,
      weeklySessionTarget: weeklySessionTarget
        ? Number(weeklySessionTarget)
        : null,
      ...extra,
    };
  }

  function save(input: UpdateProfileInput) {
    setError(null);
    setSavedNote(null);
    startTransition(async () => {
      const result = await updateProfileGoals(input);
      if (result.status === "needs_goal_confirm") {
        setGoalWarning({ warning: result.warning, pending: result.pending });
        return;
      }
      if (result.status !== "saved") {
        setError(result.message);
        return;
      }
      setGoalWarning(null);
      hydrate(result.data);
      setSavedNote("Profile saved.");
    });
  }

  function switchToAutomatic(confirm = false) {
    setError(null);
    startTransition(async () => {
      const result = await setNutritionTargetMode({
        mode: "automatic",
        confirmAutomatic: confirm,
      });
      if (result.status === "needs_confirm") {
        setAutoConfirm(result.proposed);
        return;
      }
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setAutoConfirm(null);
      setData((current) =>
        current ? { ...current, nutritionTargets: result.targets } : current,
      );
      setManualCalories(String(result.targets.daily_calories));
      setManualProtein(String(result.targets.protein_g));
      setManualCarbs(String(result.targets.carbs_g));
      setManualFat(String(result.targets.fat_g));
      setSavedNote("Automatic targets applied.");
    });
  }

  function saveManualTargets() {
    setError(null);
    startTransition(async () => {
      const result = await setNutritionTargetMode({
        mode: "manual",
        dailyCalories: Number(manualCalories),
        proteinG: Number(manualProtein),
        carbsG: Number(manualCarbs),
        fatG: Number(manualFat),
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (result.status !== "saved") {
        setError("Targets couldn’t be saved.");
        return;
      }
      setData((current) =>
        current ? { ...current, nutritionTargets: result.targets } : current,
      );
      setSavedNote("Manual targets saved.");
    });
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

  const isManual = data?.nutritionTargets?.is_manual === true;
  const targets = data?.nutritionTargets;

  return (
    <div className="mx-auto w-full max-w-lg px-5 py-8 sm:px-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-serif text-[2rem] leading-tight tracking-tight">
          Profile & Goals
        </h1>
        <Link
          href="/progress"
          className="text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Progress
        </Link>
      </div>
      <p className="mt-2 text-[14px] leading-6 text-muted">
        Update your details without repeating onboarding. Changes flow through
        to Coach, Nutrition, Today and Training.
      </p>

      {goalWarning ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>
            {goalWarning.warning.message ??
              "You’re changing goals fairly soon after starting your current plan."}
          </CoachMessage>
          <div className="flex flex-col gap-2">
            <Link
              href="/progress"
              className="min-h-11 rounded-full border border-border px-4 py-2.5 text-center text-[14px] text-foreground"
            >
              Review progress first
            </Link>
            <button
              type="button"
              onClick={() => setGoalWarning(null)}
              className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px] text-foreground"
            >
              Adjust my current plan
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                save({
                  ...goalWarning.pending,
                  confirmGoalChange: true,
                })
              }
              className="min-h-11 rounded-full bg-white/10 px-4 py-2.5 text-[14px] text-foreground"
            >
              Continue changing my goal
            </button>
          </div>
        </section>
      ) : null}

      {autoConfirm ? (
        <section className="mt-8 space-y-4">
          <CoachMessage>
            {`Proposed automatic targets: ${autoConfirm.dailyCalories} kcal · ${autoConfirm.proteinG}g protein · ${autoConfirm.carbsG}g carbs · ${autoConfirm.fatG}g fat. Apply these and leave manual mode?`}
          </CoachMessage>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => switchToAutomatic(true)}
              className="min-h-11 rounded-full bg-white/10 px-4 py-2.5 text-[14px]"
            >
              Apply automatic targets
            </button>
            <button
              type="button"
              onClick={() => setAutoConfirm(null)}
              className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px]"
            >
              Keep current targets
            </button>
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Personal details
        </h2>
        <div className="mt-4 space-y-4">
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Age">
            <input
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div>
            <p className="mb-2 text-[13px] text-muted">Sex</p>
            <OptionSelector
              name="sex"
              options={sexOptions}
              value={sex}
              onChange={setSex}
            />
          </div>
          <Field label="Height (cm)">
            <input
              inputMode="decimal"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Current weight (kg)">
            <input
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div>
            <p className="mb-2 text-[13px] text-muted">Preferred weight unit</p>
            <OptionSelector
              name="unit"
              options={[
                { id: "kg", label: "kg" },
                { id: "st", label: "st/lb" },
              ]}
              value={preferredUnit}
              onChange={setPreferredUnit}
            />
          </div>
          <div>
            <p className="mb-2 text-[13px] text-muted">Activity level</p>
            <OptionSelector
              name="activity"
              options={activityLevelOptions}
              value={activityLevel}
              onChange={setActivityLevel}
            />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Fitness goal
        </h2>
        {data?.goalStartedAt ? (
          <p className="mt-2 text-[13px] text-muted">
            Current goal started {formatUkDate(data.goalStartedAt)}
            {data.primaryGoal
              ? ` · ${optionLabel(primaryGoalOptions, data.primaryGoal)}`
              : ""}
          </p>
        ) : null}
        <div className="mt-4 space-y-4">
          <OptionSelector
            name="goal"
            options={primaryGoalOptions}
            value={primaryGoal}
            onChange={setPrimaryGoal}
          />
          <Field label="Goal in your words (optional)">
            <textarea
              value={goalOwnWords}
              onChange={(e) => setGoalOwnWords(e.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>
          <Field label="Target weight kg (optional)">
            <input
              inputMode="decimal"
              value={targetWeightKg}
              onChange={(e) => setTargetWeightKg(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Target date (optional)">
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Nutrition targets
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          {isManual
            ? "Manually set — won’t change when your weight or profile updates."
            : "Automatic — based on your profile, activity and goal."}
        </p>
        {targets ? (
          <p className="mt-3 text-[15px] leading-7 text-foreground/90">
            {targets.daily_calories} kcal · {targets.protein_g}g protein ·{" "}
            {targets.carbs_g}g carbs · {targets.fat_g}g fat
          </p>
        ) : (
          <p className="mt-3 text-[14px] text-muted">
            Targets aren’t available yet — complete the personal details above.
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Calories">
            <input
              inputMode="numeric"
              value={manualCalories}
              onChange={(e) => setManualCalories(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Protein (g)">
            <input
              inputMode="numeric"
              value={manualProtein}
              onChange={(e) => setManualProtein(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Carbs (g)">
            <input
              inputMode="numeric"
              value={manualCarbs}
              onChange={(e) => setManualCarbs(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Fat (g)">
            <input
              inputMode="numeric"
              value={manualFat}
              onChange={(e) => setManualFat(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={saveManualTargets}
            className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px]"
          >
            Save as manual
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => switchToAutomatic(false)}
            className="min-h-11 rounded-full border border-border px-4 py-2.5 text-[14px]"
          >
            Use automatic
          </button>
        </div>
        {data?.proposedAutomaticTargets && isManual ? (
          <p className="mt-3 text-[13px] text-muted">
            Automatic estimate right now:{" "}
            {data.proposedAutomaticTargets.dailyCalories} kcal ·{" "}
            {data.proposedAutomaticTargets.proteinG}g protein
          </p>
        ) : null}
      </section>

      <section className="mt-10">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Training & diet preferences
        </h2>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-[13px] text-muted">Training frequency</p>
            <OptionSelector
              name="freq"
              options={trainingFrequencyOptions}
              value={trainingFrequency}
              onChange={setTrainingFrequency}
            />
          </div>
          <Field label="Weekly session target">
            <input
              inputMode="numeric"
              value={weeklySessionTarget}
              onChange={(e) => setWeeklySessionTarget(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Daily step target">
            <input
              inputMode="numeric"
              value={dailyStepTarget}
              onChange={(e) => setDailyStepTarget(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div>
            <p className="mb-2 text-[13px] text-muted">Dietary preferences</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="diet">
              {dietOptions.map((option) => {
                const selected = dietaryPreferences.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setDietaryPreferences((current) =>
                        selected
                          ? current.filter((id) => id !== option.id)
                          : [...current, option.id],
                      )
                    }
                    className={`min-h-11 rounded-full border px-4 py-2.5 text-[14px] ${
                      selected
                        ? "border-white/20 bg-white/8 text-foreground"
                        : "border-border text-muted"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Field label="Foods you avoid">
            <textarea
              value={foodsAvoided}
              onChange={(e) => setFoodsAvoided(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>
          <Field label="Allergies / intolerances">
            <textarea
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <div className="mt-10 flex flex-col gap-3 pb-8">
        <button
          type="button"
          disabled={pending}
          onClick={() => save(buildInput())}
          className="min-h-12 rounded-full bg-white/12 px-5 py-3 text-[15px] font-medium text-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save profile"}
        </button>
        {savedNote ? (
          <p className="text-center text-[13px] text-muted">{savedNote}</p>
        ) : null}
        {error ? (
          <p className="text-center text-[13px] text-red-300/90">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function formatUkDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}
