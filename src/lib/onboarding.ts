export const onboardingStepIds = [
  "displayName",
  "primaryGoal",
  "goalOwnWords",
  "age",
  "sex",
  "height",
  "weight",
  "trainingFrequency",
  "trainingTypes",
  "trainingLocation",
  "equipment",
  "likesDislikes",
  "activityLevel",
  "typicalSleep",
  "lifestyleConstraints",
  "dietaryPreferences",
  "foodsAvoided",
  "allergies",
  "mealsPerDay",
  "nutritionSupport",
  "coachingStyle",
] as const;

export type OnboardingStepId = (typeof onboardingStepIds)[number];

export type HeightAnswer = {
  unit: "cm" | "ft";
  cm?: number;
  feet?: number;
  inches?: number;
};

export type WeightAnswer = {
  unit: "kg" | "st";
  kg?: number;
  stone?: number;
  pounds?: number;
};

export type OnboardingAnswers = {
  displayName: string;
  primaryGoal: string;
  goalOwnWords: string;
  age: number;
  sex: string;
  height: HeightAnswer;
  weight: WeightAnswer;
  trainingFrequency: string;
  trainingTypes: string[];
  trainingLocation: string;
  equipment: string[];
  likesDislikes: string;
  activityLevel: string;
  typicalSleep: string;
  lifestyleConstraints: string;
  dietaryPreferences: string[];
  foodsAvoided: string;
  allergies: string;
  mealsPerDay: number;
  nutritionSupport: string;
  coachingStyle: string;
};

export type OnboardingDraft = Partial<OnboardingAnswers>;

type Option = { id: string; label: string };

export const primaryGoalOptions: Option[] = [
  { id: "muscle", label: "Build muscle" },
  { id: "lean", label: "Get leaner" },
  { id: "recomp", label: "Build muscle & get leaner" },
  { id: "fitness", label: "Improve fitness" },
  { id: "maintain", label: "Maintain my physique" },
  { id: "other", label: "Something else" },
];

export const sexOptions: Option[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "nonbinary", label: "Non-binary" },
  { id: "unspecified", label: "Prefer not to say" },
];

export const trainingFrequencyOptions: Option[] = [
  { id: "0-1", label: "0–1 days a week" },
  { id: "2-3", label: "2–3 days a week" },
  { id: "4-5", label: "4–5 days a week" },
  { id: "6+", label: "6+ days a week" },
];

export const trainingTypeOptions: Option[] = [
  { id: "weights", label: "Weights" },
  { id: "hiit", label: "HIIT" },
  { id: "cardio", label: "Cardio" },
  { id: "classes", label: "Classes" },
  { id: "sport", label: "Sport" },
  { id: "home", label: "Home workouts" },
];

export const trainingLocationOptions: Option[] = [
  { id: "gym", label: "Gym" },
  { id: "home", label: "Home" },
  { id: "both", label: "Both" },
  { id: "outdoors", label: "Outdoors" },
];

export const equipmentOptions: Option[] = [
  { id: "full-gym", label: "Full gym" },
  { id: "dumbbells", label: "Dumbbells" },
  { id: "barbell", label: "Barbell" },
  { id: "machines", label: "Machines" },
  { id: "bands", label: "Bands" },
  { id: "bodyweight", label: "Bodyweight only" },
];

export const activityLevelOptions: Option[] = [
  { id: "sedentary", label: "Mostly seated" },
  { id: "light", label: "Lightly active" },
  { id: "moderate", label: "Moderately active" },
  { id: "active", label: "Active" },
  { id: "very", label: "Very active" },
];

export const sleepOptions: Option[] = [
  { id: "under-6", label: "Under 6 hours" },
  { id: "6-7", label: "6–7 hours" },
  { id: "7-8", label: "7–8 hours" },
  { id: "8-plus", label: "8+ hours" },
];

export const dietOptions: Option[] = [
  { id: "none", label: "No preference" },
  { id: "high-protein", label: "High protein" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "halal", label: "Halal" },
  { id: "low-carb", label: "Lower carb" },
];

export const mealsPerDayOptions: Option[] = [
  { id: "2", label: "2" },
  { id: "3", label: "3" },
  { id: "4", label: "4" },
  { id: "5", label: "5+" },
];

export const nutritionSupportOptions: Option[] = [
  { id: "basics", label: "Just the basics" },
  { id: "some", label: "A bit of guidance" },
  { id: "involved", label: "Quite involved" },
  { id: "full", label: "Full coaching" },
];

export const coachingStyleOptions: Option[] = [
  { id: "push", label: "Push me" },
  { id: "accountable", label: "Keep me accountable" },
  { id: "explain", label: "Explain the reasoning" },
  { id: "supportive", label: "Keep it supportive" },
  { id: "mix", label: "A mix" },
];

export function optionLabel(options: Option[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

export function isStepAnswered(
  id: OnboardingStepId,
  draft: OnboardingDraft,
): boolean {
  const value = draft[id];

  if (id === "trainingTypes" || id === "equipment" || id === "dietaryPreferences") {
    return Array.isArray(value) && value.length > 0;
  }

  if (id === "height") {
    const height = draft.height;
    if (!height) {
      return false;
    }
    return height.unit === "cm"
      ? Boolean(height.cm && height.cm > 0)
      : Boolean(height.feet && height.feet > 0);
  }

  if (id === "weight") {
    const weight = draft.weight;
    if (!weight) {
      return false;
    }
    return weight.unit === "kg"
      ? Boolean(weight.kg && weight.kg > 0)
      : Boolean(weight.stone && weight.stone > 0);
  }

  if (typeof value === "number") {
    return value > 0;
  }

  return typeof value === "string" && value.trim().length > 0;
}

export function firstIncompleteStep(
  draft: OnboardingDraft,
): OnboardingStepId | "done" {
  return onboardingStepIds.find((id) => !isStepAnswered(id, draft)) ?? "done";
}

export function questionForStep(
  id: OnboardingStepId,
  draft: OnboardingDraft,
): string {
  const name = draft.displayName?.trim();

  switch (id) {
    case "displayName":
      return "What should I call you?";
    case "primaryGoal":
      return name
        ? `Nice to meet you, ${name}. What’s the main thing you want from this?`
        : "What’s the main thing you want from this?";
    case "goalOwnWords":
      return "In your own words, what does that look like for you?";
    case "age":
      return "How old are you?";
    case "sex":
      return "And how should I think about sex for training and nutrition?";
    case "height":
      return "What’s your height?";
    case "weight":
      return "And your current weight?";
    case "trainingFrequency":
      return "How often are you training each week at the moment?";
    case "trainingTypes":
      return "What kinds of training do you do? Pick all that fit.";
    case "trainingLocation":
      return "Where do you usually train?";
    case "equipment":
      return "What equipment do you have access to?";
    case "likesDislikes":
      return "Any exercises you love or want to avoid?";
    case "activityLevel":
      return "Outside of training, how active is a normal day?";
    case "typicalSleep":
      return "How much sleep do you typically get?";
    case "lifestyleConstraints":
      return "Anything I should know about time, work, or family?";
    case "dietaryPreferences":
      return "Any dietary preferences I should work with?";
    case "foodsAvoided":
      return "Foods you prefer to avoid?";
    case "allergies":
      return "Any allergies or intolerances?";
    case "mealsPerDay":
      return "How many meals do you usually eat in a day?";
    case "nutritionSupport":
      return "How involved should I be with nutrition?";
    case "coachingStyle":
      return "And how do you want me to coach you?";
  }
}

export function labelForAnswer(
  id: OnboardingStepId,
  draft: OnboardingDraft,
): string {
  switch (id) {
    case "displayName":
      return draft.displayName ?? "";
    case "primaryGoal":
      return optionLabel(primaryGoalOptions, draft.primaryGoal ?? "");
    case "goalOwnWords":
      return draft.goalOwnWords ?? "";
    case "age":
      return draft.age ? `${draft.age}` : "";
    case "sex":
      return optionLabel(sexOptions, draft.sex ?? "");
    case "height":
      return formatHeight(draft.height);
    case "weight":
      return formatWeight(draft.weight);
    case "trainingFrequency":
      return optionLabel(trainingFrequencyOptions, draft.trainingFrequency ?? "");
    case "trainingTypes":
      return (draft.trainingTypes ?? [])
        .map((item) => optionLabel(trainingTypeOptions, item))
        .join(", ");
    case "trainingLocation":
      return optionLabel(trainingLocationOptions, draft.trainingLocation ?? "");
    case "equipment":
      return (draft.equipment ?? [])
        .map((item) => optionLabel(equipmentOptions, item))
        .join(", ");
    case "likesDislikes":
      return draft.likesDislikes ?? "";
    case "activityLevel":
      return optionLabel(activityLevelOptions, draft.activityLevel ?? "");
    case "typicalSleep":
      return optionLabel(sleepOptions, draft.typicalSleep ?? "");
    case "lifestyleConstraints":
      return draft.lifestyleConstraints ?? "";
    case "dietaryPreferences":
      return (draft.dietaryPreferences ?? [])
        .map((item) => optionLabel(dietOptions, item))
        .join(", ");
    case "foodsAvoided":
      return draft.foodsAvoided ?? "";
    case "allergies":
      return draft.allergies ?? "";
    case "mealsPerDay":
      return optionLabel(mealsPerDayOptions, String(draft.mealsPerDay ?? ""));
    case "nutritionSupport":
      return optionLabel(nutritionSupportOptions, draft.nutritionSupport ?? "");
    case "coachingStyle":
      return optionLabel(coachingStyleOptions, draft.coachingStyle ?? "");
  }
}

export function formatHeight(height?: HeightAnswer): string {
  if (!height) {
    return "";
  }
  if (height.unit === "cm") {
    return height.cm ? `${height.cm} cm` : "";
  }
  const inches = height.inches ?? 0;
  return height.feet ? `${height.feet}′${inches}″` : "";
}

export function formatWeight(weight?: WeightAnswer): string {
  if (!weight) {
    return "";
  }
  if (weight.unit === "kg") {
    return weight.kg ? `${weight.kg} kg` : "";
  }
  const pounds = weight.pounds ?? 0;
  return weight.stone ? `${weight.stone} st ${pounds} lb` : "";
}

export function heightToCm(height: HeightAnswer): number | null {
  if (height.unit === "cm") {
    return height.cm && height.cm > 0 ? height.cm : null;
  }
  if (!height.feet) {
    return null;
  }
  const inches = (height.feet * 12 + (height.inches ?? 0)) * 2.54;
  return Math.round(inches * 10) / 10;
}

export function weightToKg(weight: WeightAnswer): number | null {
  if (weight.unit === "kg") {
    return weight.kg && weight.kg > 0 ? weight.kg : null;
  }
  if (!weight.stone) {
    return null;
  }
  const kg = (weight.stone * 14 + (weight.pounds ?? 0)) * 0.453592;
  return Math.round(kg * 10) / 10;
}

export type ProfileRecord = {
  display_name: string;
  primary_goal: string;
  goal_in_own_words: string;
  age: number;
  sex: string;
  height_cm: number | null;
  weight_kg: number | null;
  training_frequency: string;
  training_types: string[];
  training_location: string;
  equipment: string[];
  likes_dislikes: string;
  activity_level: string;
  typical_sleep: string;
  lifestyle_constraints: string;
  dietary_preferences: string[];
  foods_avoided: string;
  allergies: string;
  meals_per_day: number;
  nutrition_support: string;
  coaching_style: string;
  onboarding_completed_at: string;
  goal_started_at: string;
  preferred_weight_unit: "kg" | "st";
};

export function toProfileRecord(answers: OnboardingAnswers): ProfileRecord {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return {
    display_name: answers.displayName.trim(),
    primary_goal: answers.primaryGoal,
    goal_in_own_words: answers.goalOwnWords.trim(),
    age: answers.age,
    sex: answers.sex,
    height_cm: heightToCm(answers.height),
    weight_kg: weightToKg(answers.weight),
    training_frequency: answers.trainingFrequency,
    training_types: answers.trainingTypes,
    training_location: answers.trainingLocation,
    equipment: answers.equipment,
    likes_dislikes: answers.likesDislikes.trim(),
    activity_level: answers.activityLevel,
    typical_sleep: answers.typicalSleep,
    lifestyle_constraints: answers.lifestyleConstraints.trim(),
    dietary_preferences: answers.dietaryPreferences,
    foods_avoided: answers.foodsAvoided.trim(),
    allergies: answers.allergies.trim(),
    meals_per_day: answers.mealsPerDay,
    nutrition_support: answers.nutritionSupport,
    coaching_style: answers.coachingStyle,
    onboarding_completed_at: new Date().toISOString(),
    goal_started_at: localDate,
    preferred_weight_unit: answers.weight.unit === "st" ? "st" : "kg",
  };
}

export function isOnboardingComplete(
  draft: OnboardingDraft,
): draft is OnboardingAnswers {
  return firstIncompleteStep(draft) === "done";
}
