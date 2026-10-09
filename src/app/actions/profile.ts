"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { evaluateGoalChangeWarning } from "@/lib/goal-history";
import { getLocalLoggedDate, isValidLoggedDate } from "@/lib/nutrition";
import {
  applyNutritionTargetsForUser,
  ensureNutritionTargetsForUser,
} from "@/lib/nutrition-day";
import { calculateNutritionTargets } from "@/lib/nutrition-targets";
import {
  activityLevelOptions,
  primaryGoalOptions,
  sexOptions,
  trainingFrequencyOptions,
} from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { logWeightMeasurement } from "@/app/actions/weight";
import type { NutritionTargetRecord } from "@/lib/nutrition";

export type ProfileGoalsData = {
  displayName: string | null;
  age: number | null;
  sex: string | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: string | null;
  trainingFrequency: string | null;
  primaryGoal: string | null;
  goalOwnWords: string | null;
  goalStartedAt: string | null;
  targetWeightKg: number | null;
  targetDate: string | null;
  preferredWeightUnit: "kg" | "st" | null;
  dietaryPreferences: string[];
  foodsAvoided: string | null;
  allergies: string | null;
  dailyStepTarget: number | null;
  weeklySessionTarget: number | null;
  nutritionTargets: NutritionTargetRecord | null;
  proposedAutomaticTargets: {
    dailyCalories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
};

export type LoadProfileResult =
  | { status: "ok"; data: ProfileGoalsData }
  | { status: "error"; message: string };

export type UpdateProfileResult =
  | {
      status: "saved";
      data: ProfileGoalsData;
      goalWarning: ReturnType<typeof evaluateGoalChangeWarning> | null;
    }
  | {
      status: "needs_goal_confirm";
      warning: ReturnType<typeof evaluateGoalChangeWarning>;
      pending: UpdateProfileInput;
    }
  | { status: "error"; message: string };

export type UpdateProfileInput = {
  displayName?: string | null;
  age?: number | null;
  sex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: string | null;
  trainingFrequency?: string | null;
  primaryGoal?: string | null;
  goalOwnWords?: string | null;
  targetWeightKg?: number | null;
  targetDate?: string | null;
  preferredWeightUnit?: "kg" | "st" | null;
  dietaryPreferences?: string[];
  foodsAvoided?: string | null;
  allergies?: string | null;
  dailyStepTarget?: number | null;
  weeklySessionTarget?: number | null;
  /** Confirm a warned goal change. */
  confirmGoalChange?: boolean;
  goalChangeReason?: string | null;
};

function optionIds(options: { id: string }[]): Set<string> {
  return new Set(options.map((o) => o.id));
}

async function loadProfileData(
  userId: string,
): Promise<LoadProfileResult> {
  const supabase = await createClient();
  const [{ data: profile, error }, ensured] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "display_name, age, sex, height_cm, weight_kg, activity_level, training_frequency, primary_goal, goal_in_own_words, goal_started_at, target_weight_kg, target_date, preferred_weight_unit, dietary_preferences, foods_avoided, allergies, daily_step_target, weekly_session_target",
      )
      .eq("id", userId)
      .maybeSingle(),
    ensureNutritionTargetsForUser(supabase, userId),
  ]);

  if (error || !profile) {
    return { status: "error", message: "Profile couldn’t be loaded." };
  }

  const calculated = calculateNutritionTargets({
    age: typeof profile.age === "number" ? profile.age : null,
    sex: typeof profile.sex === "string" ? profile.sex : null,
    height_cm:
      typeof profile.height_cm === "number" ? Number(profile.height_cm) : null,
    weight_kg:
      typeof profile.weight_kg === "number" ? Number(profile.weight_kg) : null,
    primary_goal:
      typeof profile.primary_goal === "string" ? profile.primary_goal : null,
    activity_level:
      typeof profile.activity_level === "string"
        ? profile.activity_level
        : null,
    training_frequency:
      typeof profile.training_frequency === "string"
        ? profile.training_frequency
        : null,
  });

  const proposed =
    calculated.status === "ok"
      ? {
          dailyCalories: calculated.targets.dailyCalories,
          proteinG: calculated.targets.proteinG,
          carbsG: calculated.targets.carbsG,
          fatG: calculated.targets.fatG,
        }
      : null;

  return {
    status: "ok",
    data: {
      displayName:
        typeof profile.display_name === "string" ? profile.display_name : null,
      age: typeof profile.age === "number" ? profile.age : null,
      sex: typeof profile.sex === "string" ? profile.sex : null,
      heightCm:
        typeof profile.height_cm === "number"
          ? Number(profile.height_cm)
          : null,
      weightKg:
        typeof profile.weight_kg === "number"
          ? Number(profile.weight_kg)
          : null,
      activityLevel:
        typeof profile.activity_level === "string"
          ? profile.activity_level
          : null,
      trainingFrequency:
        typeof profile.training_frequency === "string"
          ? profile.training_frequency
          : null,
      primaryGoal:
        typeof profile.primary_goal === "string" ? profile.primary_goal : null,
      goalOwnWords:
        typeof profile.goal_in_own_words === "string"
          ? profile.goal_in_own_words
          : null,
      goalStartedAt:
        typeof profile.goal_started_at === "string"
          ? profile.goal_started_at
          : null,
      targetWeightKg:
        typeof profile.target_weight_kg === "number"
          ? Number(profile.target_weight_kg)
          : null,
      targetDate:
        typeof profile.target_date === "string" ? profile.target_date : null,
      preferredWeightUnit:
        profile.preferred_weight_unit === "kg" ||
        profile.preferred_weight_unit === "st"
          ? profile.preferred_weight_unit
          : null,
      dietaryPreferences: Array.isArray(profile.dietary_preferences)
        ? profile.dietary_preferences.filter(
            (v): v is string => typeof v === "string",
          )
        : [],
      foodsAvoided:
        typeof profile.foods_avoided === "string"
          ? profile.foods_avoided
          : null,
      allergies:
        typeof profile.allergies === "string" ? profile.allergies : null,
      dailyStepTarget:
        typeof profile.daily_step_target === "number"
          ? profile.daily_step_target
          : null,
      weeklySessionTarget:
        typeof profile.weekly_session_target === "number"
          ? profile.weekly_session_target
          : null,
      nutritionTargets: ensured.targets,
      proposedAutomaticTargets: proposed,
    },
  };
}

export async function loadProfileGoals(): Promise<LoadProfileResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }
  try {
    return await loadProfileData(user.id);
  } catch (error) {
    console.error("[profile] Load failed:", error);
    return { status: "error", message: "Profile couldn’t be loaded." };
  }
}

export async function updateProfileGoals(
  input: UpdateProfileInput,
): Promise<UpdateProfileResult> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();
    const current = await loadProfileData(user.id);
    if (current.status !== "ok") {
      return current;
    }

    const today = getLocalLoggedDate();
    const nextGoal =
      input.primaryGoal !== undefined
        ? input.primaryGoal
        : current.data.primaryGoal;

    if (
      input.primaryGoal !== undefined &&
      input.primaryGoal &&
      !optionIds(primaryGoalOptions).has(input.primaryGoal)
    ) {
      return { status: "error", message: "That goal isn’t valid." };
    }

    const warning = evaluateGoalChangeWarning({
      currentGoal: current.data.primaryGoal,
      nextGoal,
      goalStartedAt: current.data.goalStartedAt,
      today,
    });

    if (warning.shouldWarn && !input.confirmGoalChange) {
      return {
        status: "needs_goal_confirm",
        warning,
        pending: input,
      };
    }

    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) {
      patch.display_name = input.displayName?.trim() || null;
    }
    if (input.age !== undefined) {
      patch.age =
        input.age != null && Number.isFinite(input.age)
          ? Math.round(input.age)
          : null;
    }
    if (input.sex !== undefined) {
      if (input.sex && !optionIds(sexOptions).has(input.sex)) {
        return { status: "error", message: "That sex option isn’t valid." };
      }
      patch.sex = input.sex;
    }
    if (input.heightCm !== undefined) {
      patch.height_cm = input.heightCm;
    }
    if (input.activityLevel !== undefined) {
      if (
        input.activityLevel &&
        !optionIds(activityLevelOptions).has(input.activityLevel)
      ) {
        return { status: "error", message: "That activity level isn’t valid." };
      }
      patch.activity_level = input.activityLevel;
    }
    if (input.trainingFrequency !== undefined) {
      if (
        input.trainingFrequency &&
        !optionIds(trainingFrequencyOptions).has(input.trainingFrequency)
      ) {
        return {
          status: "error",
          message: "That training frequency isn’t valid.",
        };
      }
      patch.training_frequency = input.trainingFrequency;
    }
    if (input.goalOwnWords !== undefined) {
      patch.goal_in_own_words = input.goalOwnWords?.trim() || null;
    }
    if (input.targetWeightKg !== undefined) {
      patch.target_weight_kg = input.targetWeightKg;
    }
    if (input.targetDate !== undefined) {
      if (input.targetDate && !isValidLoggedDate(input.targetDate)) {
        return { status: "error", message: "That target date isn’t valid." };
      }
      patch.target_date = input.targetDate;
    }
    if (input.preferredWeightUnit !== undefined) {
      patch.preferred_weight_unit = input.preferredWeightUnit;
    }
    if (input.dietaryPreferences !== undefined) {
      patch.dietary_preferences = input.dietaryPreferences;
    }
    if (input.foodsAvoided !== undefined) {
      patch.foods_avoided = input.foodsAvoided?.trim() || null;
    }
    if (input.allergies !== undefined) {
      patch.allergies = input.allergies?.trim() || null;
    }
    if (input.dailyStepTarget !== undefined) {
      patch.daily_step_target = input.dailyStepTarget;
    }
    if (input.weeklySessionTarget !== undefined) {
      patch.weekly_session_target = input.weeklySessionTarget;
    }

    const goalChanging =
      input.primaryGoal !== undefined &&
      input.primaryGoal !== current.data.primaryGoal;

    if (goalChanging) {
      patch.primary_goal = input.primaryGoal;
      patch.goal_started_at = today;
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user.id);
      if (error) {
        console.error("[profile] Update failed:", error.message);
        return { status: "error", message: "Profile couldn’t be saved." };
      }
    }

    if (goalChanging) {
      if (current.data.goalStartedAt || current.data.primaryGoal) {
        await supabase
          .from("goal_history")
          .update({ effective_to: today })
          .eq("user_id", user.id)
          .is("effective_to", null);
      }
      await supabase.from("goal_history").insert({
        user_id: user.id,
        primary_goal: input.primaryGoal,
        goal_in_own_words:
          input.goalOwnWords ?? current.data.goalOwnWords,
        target_weight_kg:
          input.targetWeightKg ?? current.data.targetWeightKg,
        target_date: input.targetDate ?? current.data.targetDate,
        effective_from: today,
        change_reason: input.goalChangeReason?.trim() || null,
        source: "profile",
      });
    }

    if (input.weightKg != null && Number.isFinite(input.weightKg)) {
      const weightResult = await logWeightMeasurement({
        weightKg: input.weightKg,
        source: "profile",
        measuredOn: today,
      });
      if (weightResult.status !== "saved") {
        return { status: "error", message: weightResult.message };
      }
    }

    // Recalc automatic targets after profile/weight/goal changes when not manual.
    if (!current.data.nutritionTargets?.is_manual) {
      await ensureNutritionTargetsForUser(supabase, user.id);
    }

    const refreshed = await loadProfileData(user.id);
    if (refreshed.status !== "ok") {
      return refreshed;
    }

    return {
      status: "saved",
      data: refreshed.data,
      goalWarning: warning.shouldWarn ? warning : null,
    };
  } catch (error) {
    console.error("[profile] Update failed:", error);
    return { status: "error", message: "Profile couldn’t be saved." };
  }
}

export async function setNutritionTargetMode(input: {
  mode: "automatic" | "manual";
  dailyCalories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  /** Required when switching to automatic so the user confirms proposed values. */
  confirmAutomatic?: boolean;
}): Promise<
  | { status: "saved"; targets: NutritionTargetRecord }
  | {
      status: "needs_confirm";
      proposed: {
        dailyCalories: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
      };
    }
  | { status: "error"; message: string }
> {
  if (!isSupabaseConfigured()) {
    return { status: "error", message: "Supabase isn’t connected." };
  }
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "You’re not signed in." };
  }

  try {
    const supabase = await createClient();

    if (input.mode === "manual") {
      if (
        input.dailyCalories == null ||
        input.proteinG == null ||
        input.carbsG == null ||
        input.fatG == null
      ) {
        return {
          status: "error",
          message: "Enter calorie and macro targets.",
        };
      }
      const applied = await applyNutritionTargetsForUser(supabase, {
        userId: user.id,
        dailyCalories: input.dailyCalories,
        proteinG: input.proteinG,
        carbsG: input.carbsG,
        fatG: input.fatG,
        isManual: true,
        source: "manual",
        reason: "Manual targets set in Profile",
      });
      if (applied.status !== "ok" || !applied.targets) {
        return {
          status: "error",
          message: applied.message ?? "Targets couldn’t be saved.",
        };
      }
      return { status: "saved", targets: applied.targets };
    }

    // Automatic mode — show proposed first unless confirmed.
    const profileLoad = await loadProfileData(user.id);
    if (profileLoad.status !== "ok" || !profileLoad.data.proposedAutomaticTargets) {
      return {
        status: "error",
        message: "Automatic targets couldn’t be calculated yet.",
      };
    }
    const proposed = profileLoad.data.proposedAutomaticTargets;
    if (!input.confirmAutomatic) {
      return { status: "needs_confirm", proposed };
    }

    const applied = await applyNutritionTargetsForUser(supabase, {
      userId: user.id,
      dailyCalories: proposed.dailyCalories,
      proteinG: proposed.proteinG,
      carbsG: proposed.carbsG,
      fatG: proposed.fatG,
      isManual: false,
      source: "profile_recalc",
      reason: "Returned to automatic targets",
    });
    if (applied.status !== "ok" || !applied.targets) {
      return {
        status: "error",
        message: applied.message ?? "Targets couldn’t be saved.",
      };
    }
    return { status: "saved", targets: applied.targets };
  } catch (error) {
    console.error("[profile] Target mode failed:", error);
    return { status: "error", message: "Targets couldn’t be saved." };
  }
}
