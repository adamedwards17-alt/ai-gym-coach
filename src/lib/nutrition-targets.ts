/**
 * Deterministic nutrition target calculation (methodology v1).
 * Gemini must never compute these values.
 */

export const NUTRITION_METHODOLOGY_VERSION = "v1";

export type NutritionSex = "male" | "female" | "nonbinary" | "unspecified";

export type NutritionGoalId =
  | "lean"
  | "muscle"
  | "recomp"
  | "maintain"
  | "fitness"
  | "other";

export type NutritionActivityId =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very";

export type NutritionProfileInput = {
  age: number | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  primary_goal: string | null;
  activity_level: string | null;
  training_frequency?: string | null;
};

export type NutritionTargetsValues = {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  methodologyVersion: typeof NUTRITION_METHODOLOGY_VERSION;
  rmr: number;
  tdee: number;
};

export type NutritionTargetsResult =
  | { status: "ok"; targets: NutritionTargetsValues }
  | {
      status: "incomplete";
      message: string;
      missing: string[];
    }
  | {
      status: "review";
      message: string;
    };

const ACTIVITY_MULTIPLIER: Record<NutritionActivityId, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
};

const GOAL_CALORIE_FACTOR: Record<NutritionGoalId, number> = {
  lean: 0.825,
  muscle: 1.075,
  recomp: 0.975,
  maintain: 1.0,
  fitness: 1.0,
  other: 1.0,
};

const GOAL_PROTEIN_G_PER_KG: Record<NutritionGoalId, number> = {
  lean: 2.0,
  muscle: 1.8,
  recomp: 2.0,
  maintain: 1.6,
  fitness: 1.6,
  other: 1.6,
};

function isGoalId(value: string): value is NutritionGoalId {
  return (
    value === "lean" ||
    value === "muscle" ||
    value === "recomp" ||
    value === "maintain" ||
    value === "fitness" ||
    value === "other"
  );
}

function isActivityId(value: string): value is NutritionActivityId {
  return (
    value === "sedentary" ||
    value === "light" ||
    value === "moderate" ||
    value === "active" ||
    value === "very"
  );
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateRmrKcal(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: NutritionSex;
}): number {
  const base =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;

  if (input.sex === "male") {
    return base + 5;
  }
  if (input.sex === "female") {
    return base - 161;
  }
  // Non-binary / unspecified: midpoint of male and female Mifflin equations.
  return base - 78;
}

export function calculateNutritionTargets(
  profile: NutritionProfileInput,
): NutritionTargetsResult {
  const missing: string[] = [];

  if (profile.age == null || !Number.isFinite(profile.age) || profile.age < 16 || profile.age > 90) {
    missing.push("age");
  }
  if (profile.height_cm == null || !Number.isFinite(profile.height_cm) || profile.height_cm < 120 || profile.height_cm > 230) {
    missing.push("height");
  }
  if (profile.weight_kg == null || !Number.isFinite(profile.weight_kg) || profile.weight_kg < 35 || profile.weight_kg > 250) {
    missing.push("weight");
  }
  if (!profile.sex) {
    missing.push("sex");
  }
  if (!profile.primary_goal || !isGoalId(profile.primary_goal)) {
    missing.push("primary_goal");
  }
  if (!profile.activity_level || !isActivityId(profile.activity_level)) {
    missing.push("activity_level");
  }

  if (missing.length > 0) {
    return {
      status: "incomplete",
      message:
        "Your nutrition targets need a complete profile (age, sex, height, weight, goal and activity level).",
      missing,
    };
  }

  const age = profile.age as number;
  const heightCm = profile.height_cm as number;
  const weightKg = profile.weight_kg as number;
  const sex = profile.sex as NutritionSex;
  const goal = profile.primary_goal as NutritionGoalId;
  const activity = profile.activity_level as NutritionActivityId;

  if (
    sex !== "male" &&
    sex !== "female" &&
    sex !== "nonbinary" &&
    sex !== "unspecified"
  ) {
    return {
      status: "incomplete",
      message: "Your nutrition targets need a recognised sex option on your profile.",
      missing: ["sex"],
    };
  }

  const rmr = calculateRmrKcal({
    weightKg,
    heightCm,
    age,
    sex,
  });

  if (!Number.isFinite(rmr) || rmr < 800 || rmr > 3500) {
    return {
      status: "review",
      message:
        "Your calculated resting metabolism looks unusual. Check your profile details before we set targets.",
    };
  }

  const tdee = rmr * ACTIVITY_MULTIPLIER[activity];
  let dailyCalories = roundToNearest(
    tdee * GOAL_CALORIE_FACTOR[goal],
    25,
  );

  const floorCalories = sex === "female" ? 1400 : sex === "male" ? 1600 : 1500;
  const ceilingCalories = 4500;

  if (dailyCalories < floorCalories || dailyCalories > ceilingCalories) {
    dailyCalories = clamp(dailyCalories, floorCalories, ceilingCalories);
    dailyCalories = roundToNearest(dailyCalories, 25);
  }

  if (dailyCalories < floorCalories) {
    return {
      status: "review",
      message:
        "We couldn’t set a safe calorie target from your current profile. Review your details and try again.",
    };
  }

  let proteinG = roundToNearest(
    weightKg * GOAL_PROTEIN_G_PER_KG[goal],
    5,
  );
  proteinG = clamp(proteinG, 80, 250);

  let proteinCalories = proteinG * 4;
  if (proteinCalories > dailyCalories * 0.45) {
    proteinG = roundToNearest((dailyCalories * 0.45) / 4, 5);
    proteinG = clamp(proteinG, 80, 250);
    proteinCalories = proteinG * 4;
  }

  const fatMinG = Math.max(40, roundToNearest(weightKg * 0.6, 5));
  let fatCalories = dailyCalories * 0.275;
  let fatG = roundToNearest(fatCalories / 9, 5);
  fatG = Math.max(fatG, fatMinG);
  fatG = clamp(fatG, fatMinG, 150);
  fatCalories = fatG * 9;

  let carbCalories = dailyCalories - proteinCalories - fatCalories;
  if (carbCalories < 0) {
    fatG = Math.max(
      fatMinG,
      roundToNearest((dailyCalories - proteinCalories) * 0.35 / 9, 5),
    );
    fatCalories = fatG * 9;
    carbCalories = Math.max(0, dailyCalories - proteinCalories - fatCalories);
  }

  let carbsG = roundToNearest(carbCalories / 4, 5);
  carbsG = clamp(carbsG, 0, 600);

  // Reconcile within ~25 kcal after rounding.
  const macroCalories = proteinG * 4 + carbsG * 4 + fatG * 9;
  const drift = dailyCalories - macroCalories;
  if (Math.abs(drift) > 25) {
    const carbAdjust = roundToNearest(drift / 4, 5);
    carbsG = clamp(carbsG + carbAdjust, 0, 600);
  }

  return {
    status: "ok",
    targets: {
      dailyCalories,
      proteinG,
      carbsG,
      fatG,
      methodologyVersion: NUTRITION_METHODOLOGY_VERSION,
      rmr: Math.round(rmr),
      tdee: Math.round(tdee),
    },
  };
}

export type MacroTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export function emptyMacroTotals(): MacroTotals {
  return { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
}

export function addMacroTotals(a: MacroTotals, b: MacroTotals): MacroTotals {
  return {
    calories: a.calories + b.calories,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  };
}

export function remainingMacros(
  target: MacroTotals,
  consumed: MacroTotals,
): MacroTotals {
  return {
    calories: target.calories - consumed.calories,
    proteinG: target.proteinG - consumed.proteinG,
    carbsG: target.carbsG - consumed.carbsG,
    fatG: target.fatG - consumed.fatG,
  };
}
