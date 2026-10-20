import { shiftCoachDate } from "@/lib/coach";
import type { CoachConversationRecord, CoachMessageRecord } from "@/lib/coach";
import type { CompletedDailyCheckIn } from "@/lib/check-ins";
import { buildMorningRecap } from "@/lib/morning-recap";
import {
  type MealTypeId,
  type NutritionEntryRecord,
  type NutritionTargetRecord,
} from "@/lib/nutrition";
import { summariseNutritionDay } from "@/lib/nutrition-day";
import { NUTRITION_METHODOLOGY_VERSION } from "@/lib/nutrition-targets";
import type { ProfileGoalsData } from "@/app/actions/profile";
import type { ProgressDashboardData } from "@/app/actions/progress";
import type { TodayDashboardData } from "@/app/actions/today-dashboard";
import type { TrainingHubData } from "@/app/actions/training";
import type {
  TrainingPlanEntryRecord,
  TrainingSessionRecord,
} from "@/lib/training";
import {
  addDays,
  buildWeeklyTrainingProgress,
  endOfWeekSunday,
  startOfWeekMonday,
} from "@/lib/training-week";
import type { TrainingProgrammeSummary } from "@/lib/workout-tracking";

const PREVIEW_CONVERSATION_ID = "preview-dinner";

function targets(): NutritionTargetRecord {
  return {
    daily_calories: 2400,
    protein_g: 160,
    carbs_g: 250,
    fat_g: 70,
    methodology_version: NUTRITION_METHODOLOGY_VERSION,
    calculated_at: "2026-10-01T08:00:00.000Z",
    is_manual: false,
  };
}

function food(input: {
  id: string;
  date: string;
  meal: MealTypeId;
  name: string;
  portions: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  hour: string;
}): NutritionEntryRecord {
  return {
    id: input.id,
    logged_date: input.date,
    meal_type: input.meal,
    description: input.name,
    display_name: input.name,
    search_aliases: [],
    barcode: null,
    brand: null,
    status: "eaten",
    calories_estimated: input.calories,
    protein_g_estimated: input.protein,
    carbs_g_estimated: input.carbs,
    fat_g_estimated: input.fat,
    estimation_confidence: "high",
    estimation_source: "user",
    meal_id: null,
    portions: input.portions,
    created_at: `${input.date}T${input.hour}:00.000Z`,
  };
}

export function previewNutritionEntries(today: string): NutritionEntryRecord[] {
  const yesterday = shiftCoachDate(today, -1);
  const older = shiftCoachDate(today, -3);
  return [
    food({
      id: "preview-yogurt",
      date: today,
      meal: "breakfast",
      name: "Greek yogurt and berries",
      portions: 1,
      calories: 280,
      protein: 24,
      carbs: 28,
      fat: 8,
      hour: "08:10",
    }),
    food({
      id: "preview-chicken",
      date: today,
      meal: "lunch",
      name: "Chicken, rice and greens",
      portions: 1,
      calories: 620,
      protein: 48,
      carbs: 62,
      fat: 16,
      hour: "12:40",
    }),
    food({
      id: "preview-oats",
      date: yesterday,
      meal: "breakfast",
      name: "Oats with milk",
      portions: 1,
      calories: 380,
      protein: 16,
      carbs: 58,
      fat: 9,
      hour: "07:50",
    }),
    food({
      id: "preview-salmon",
      date: yesterday,
      meal: "dinner",
      name: "Salmon, potatoes and broccoli",
      portions: 1,
      calories: 710,
      protein: 46,
      carbs: 48,
      fat: 32,
      hour: "19:10",
    }),
    food({
      id: "preview-shake",
      date: older,
      meal: "snack",
      name: "Protein shake",
      portions: 1,
      calories: 180,
      protein: 30,
      carbs: 8,
      fat: 3,
      hour: "16:00",
    }),
  ];
}

function plan(input: {
  id: string;
  date: string;
  type: TrainingPlanEntryRecord["training_type"];
  title: string;
  status: TrainingPlanEntryRecord["status"];
  minutes: number | null;
  sessionId?: string | null;
}): TrainingPlanEntryRecord {
  return {
    id: input.id,
    plan_date: input.date,
    training_type: input.type,
    title: input.title,
    focus: input.type === "strength" ? "Full body" : null,
    planned_duration_minutes: input.minutes,
    status: input.status,
    training_session_id: input.sessionId ?? null,
    original_plan_date: null,
    skip_reason: null,
    skip_notes: null,
    sort_order: 0,
    rescheduled_from_id: null,
    workout_template_id: input.type === "strength" ? "preview-upper" : null,
    created_at: `${input.date}T06:00:00.000Z`,
  };
}

function session(input: {
  id: string;
  date: string;
  title: string;
  minutes: number;
}): TrainingSessionRecord {
  return {
    id: input.id,
    session_date: input.date,
    training_type: "strength",
    title: input.title,
    duration_minutes: input.minutes,
    notes: null,
    intensity: "moderate",
    calories_burned: null,
    strength_details: [
      { exercise: "Squat", sets: 3, reps: 8, weightKg: 80 },
      { exercise: "Bench press", sets: 3, reps: 8, weightKg: 60 },
    ],
    created_at: `${input.date}T18:00:00.000Z`,
  };
}

function previewWeek(today: string): {
  plans: TrainingPlanEntryRecord[];
  sessions: TrainingSessionRecord[];
} {
  const monday = startOfWeekMonday(today);
  const yesterday = shiftCoachDate(today, -1);
  const lower = session({
    id: "preview-session-lower",
    date: yesterday,
    title: "Lower strength",
    minutes: 48,
  });
  const friday = addDays(monday, 4);
  const plans: TrainingPlanEntryRecord[] = [
    plan({
      id: "preview-plan-yesterday",
      date: yesterday,
      type: "strength",
      title: "Lower strength",
      status: "completed",
      minutes: 50,
      sessionId: lower.id,
    }),
    plan({
      id: "preview-plan-today",
      date: today,
      type: "strength",
      title: "Upper strength",
      status: "planned",
      minutes: 50,
    }),
  ];
  if (friday !== today && friday !== yesterday) {
    plans.push(
      plan({
        id: "preview-plan-fri",
        date: friday,
        type: "strength",
        title: "Full body",
        status: "planned",
        minutes: 45,
      }),
    );
  }
  return { sessions: [lower], plans };
}

export function previewTodayDashboard(today: string): TodayDashboardData {
  const entries = previewNutritionEntries(today);
  const nutrition = summariseNutritionDay({
    localDate: today,
    targets: targets(),
    targetsStatus: "ok",
    targetsMessage: null,
    entries,
  });
  const yesterday = shiftCoachDate(today, -1);
  const { plans, sessions } = previewWeek(today);
  const todayPlans = plans.filter((entry) => entry.plan_date === today);
  const checkIn: CompletedDailyCheckIn = {
    feeling: "good",
    sleep: 4,
    plan: "strength",
    sleepHours: 7,
    sleepQuality: "good",
    feelingRating: 4,
  };
  const yesterdayNutrition = summariseNutritionDay({
    localDate: yesterday,
    targets: targets(),
    targetsStatus: "ok",
    targetsMessage: null,
    entries,
  });

  return {
    localDate: today,
    hasCheckIn: true,
    checkIn,
    coachTake: "Upper strength is still open today. Protein is underway from breakfast and lunch.",
    plannedTraining: "strength",
    todayPlanEntries: todayPlans.map((entry) => ({
      id: entry.id,
      title: entry.title,
      training_type: entry.training_type,
      status: entry.status,
      planned_duration_minutes: entry.planned_duration_minutes,
    })),
    nutrition,
    loggedMealTypes: entries
      .filter((entry) => entry.logged_date === today)
      .map((entry) => entry.meal_type),
    trainingSession: null,
    todaySessions: [],
    hasTrainingSession: false,
    hasIncompletePlannedTraining: true,
    habitHistory: [],
    stoppedHabitKeys: [],
    weeklyCheckInDue: false,
    morningRecap: buildMorningRecap({
      todayDate: today,
      yesterdayDate: yesterday,
      yesterdayNutrition,
      yesterdaySessions: sessions.filter(
        (item) => item.session_date === yesterday,
      ),
      yesterdayPlanEntries: [],
      todayPlanEntries: todayPlans.map((entry) => ({
        id: entry.id,
        title: entry.title,
        training_type: entry.training_type,
        status: entry.status,
        planned_duration_minutes: entry.planned_duration_minutes,
      })),
    }),
  };
}

export function previewTrainingHub(today: string): TrainingHubData {
  const { plans, sessions } = previewWeek(today);
  return {
    localDate: today,
    weekStart: startOfWeekMonday(today),
    weekEnd: endOfWeekSunday(today),
    todayPlan: plans.find((entry) => entry.plan_date === today) ?? null,
    todayPlans: plans.filter((entry) => entry.plan_date === today),
    weekPlan: plans,
    weekSessions: sessions,
    recentSessions: sessions,
    todaySteps: {
      id: "preview-steps",
      step_date: today,
      steps: 6400,
      updated_at: `${today}T15:00:00.000Z`,
    },
    recentSteps: [],
    dailyStepTarget: 8000,
    weeklySessionTarget: 4,
    trainingFrequency: "4-5",
    pendingProposals: [],
    availabilityConstraints: [],
  };
}

export function previewProgramme(): TrainingProgrammeSummary {
  return {
    id: "preview-programme",
    slug: "muscle-building",
    name: "Muscle building",
    description: "Four strength sessions a week.",
    status: "active",
    activePhase: {
      id: "preview-phase",
      slug: "build",
      name: "Build",
      kind: "muscle_building",
      status: "active",
      start_date: "2026-10-06",
      end_date: "2026-11-16",
      duration_weeks: 6,
      notes: null,
      sort_order: 0,
    },
    upcomingPhase: null,
    templates: [
      {
        id: "preview-upper",
        code: "upper-a",
        name: "Upper A",
        focus: "Chest, back, shoulders",
      },
      {
        id: "preview-lower",
        code: "lower-a",
        name: "Lower A",
        focus: "Squat and hinge",
      },
    ],
  };
}

export function previewProgress(today: string): ProgressDashboardData {
  const { plans, sessions } = previewWeek(today);
  const measurements = [82.4, 82.8, 83.2, 83.6].map((weightKg, index) => {
    const date = shiftCoachDate(today, -index * 7);
    return {
      id: `preview-weight-${index}`,
      measured_on: date,
      weight_kg: weightKg,
      source: "progress" as const,
      notes: null,
      created_at: `${date}T07:30:00.000Z`,
    };
  });
  return {
    localDate: today,
    primaryGoal: "muscle",
    goalOwnWords: "Get stronger and leaner without rushing it.",
    goalStartedAt: "2026-09-01",
    targetWeightKg: 80,
    targetDate: "2026-12-20",
    currentWeightKg: 82.4,
    weightTrendLabel: "Down 1.2 kg over the last few weeks",
    measurements,
    weekProgress: buildWeeklyTrainingProgress({
      localDate: today,
      today,
      target: 4,
      planEntries: plans,
      sessions,
    }),
    weeklyCheckInDue: false,
    latestWeeklySummary: "Training is on track. Keep protein steady through the week.",
    nutritionTargets: {
      dailyCalories: 2400,
      proteinG: 160,
      isManual: false,
    },
  };
}

export function previewConversations(): CoachConversationRecord[] {
  return [
    {
      id: PREVIEW_CONVERSATION_ID,
      title: "Dinner ideas",
      created_at: "2026-10-19T18:00:00.000Z",
      updated_at: "2026-10-19T18:05:00.000Z",
    },
  ];
}

export function previewConversation(
  conversationId: string,
): { conversation: CoachConversationRecord; messages: CoachMessageRecord[] } | null {
  const conversation = previewConversations().find(
    (item) => item.id === conversationId,
  );
  if (!conversation) {
    return null;
  }
  const messages: CoachMessageRecord[] = [
    {
      id: "preview-msg-user",
      conversation_id: conversation.id,
      role: "user",
      content: "I have chicken and rice. What should dinner look like?",
      created_at: "2026-10-19T18:00:00.000Z",
      attachment_path: null,
      attachment_mime_type: null,
      attachment_kind: null,
      attachment_url: null,
    },
    {
      id: "preview-msg-coach",
      conversation_id: conversation.id,
      role: "assistant",
      content:
        "About 700 calories left, with room for a proper dinner.\n- Chicken rice bowl — greens and a spoon of soy sauce\n- Chicken stir-fry — same ingredients, less rice if you want it lighter\nWhich one sounds better?",
      created_at: "2026-10-19T18:01:00.000Z",
      attachment_path: null,
      attachment_mime_type: null,
      attachment_kind: null,
      attachment_url: null,
    },
  ];
  return { conversation, messages };
}

export function previewProfile(): ProfileGoalsData {
  return {
    displayName: "Alex",
    age: 34,
    sex: "male",
    heightCm: 180,
    weightKg: 82.4,
    activityLevel: "light",
    commuteSituation: "commutes",
    commutePattern: [],
    cycleCommuteDaysPerWeek: null,
    cycleCommuteMinutes: null,
    activityPatternNotes: null,
    trainingFrequency: "4-5",
    primaryGoal: "muscle",
    goalOwnWords: "Get stronger and leaner without rushing it.",
    goalStartedAt: "2026-09-01",
    targetWeightKg: 80,
    targetDate: "2026-12-20",
    preferredWeightUnit: "kg",
    dietaryPreferences: [],
    foodsAvoided: null,
    allergies: null,
    dailyStepTarget: 8000,
    weeklySessionTarget: 4,
    nutritionTargets: targets(),
    proposedAutomaticTargets: {
      dailyCalories: 2400,
      proteinG: 160,
      carbsG: 250,
      fatG: 70,
    },
  };
}

export const PREVIEW_COACH_CONVERSATION_ID = PREVIEW_CONVERSATION_ID;
