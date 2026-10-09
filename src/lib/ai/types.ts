import type {
  CoachEventType,
  CoachMessageRole,
} from "@/lib/coach";
import type {
  CoachTakeSource,
  FeelingId,
  FeelingRating,
  PlanId,
  SleepHoursOption,
  SleepQualityId,
  SleepScore,
} from "@/lib/today";

export type CoachTakeResult = {
  text: string;
  source: CoachTakeSource;
};

export type CompletedCheckIn = {
  feeling: FeelingId;
  sleep: SleepScore;
  plan: PlanId;
  sleepHours?: SleepHoursOption | null;
  sleepQuality?: SleepQualityId | null;
  feelingRating?: FeelingRating | null;
};

/** Profile fields sent to the AI — no ids, timestamps, or unused columns. */
export type CoachProfileContext = {
  display_name: string | null;
  age: number | null;
  sex: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  primary_goal: string | null;
  goal_in_own_words: string | null;
  training_frequency: string | null;
  training_types: string[] | null;
  training_location: string | null;
  equipment: string[] | null;
  likes_dislikes: string | null;
  activity_level: string | null;
  typical_sleep: string | null;
  lifestyle_constraints: string | null;
  dietary_preferences: string[] | null;
  foods_avoided: string | null;
  allergies: string | null;
  meals_per_day: number | null;
  nutrition_support: string | null;
  coaching_style: string | null;
};

export type CoachGenerationContext = {
  profile: CoachProfileContext;
  checkIn: CompletedCheckIn;
};

export type CoachChatCheckInContext = {
  date: string;
  feeling: string;
  sleep: number;
  plannedTraining: string;
};

export type CoachChatTrainingContext = {
  date: string;
  trainingType: string;
  title: string;
  durationMinutes: number | null;
  notes: string | null;
  intensity: string | null;
  caloriesBurned: number | null;
  /** True when this came from a completed plan entry. */
  fromPlan?: boolean;
  status?: "planned" | "completed" | "logged";
};

export type CoachChatPlanContext = {
  id: string;
  date: string;
  originalDate: string | null;
  trainingType: string;
  title: string;
  focus: string | null;
  plannedDurationMinutes: number | null;
  status: "planned" | "completed" | "skipped" | "rescheduled";
  completed: boolean;
  skipReason: string | null;
  linkedSessionId: string | null;
};

export type CoachChatAvailabilityContext = {
  id: string;
  startDate: string;
  endDate: string;
  constraintType: string;
  notes: string | null;
};

export type CoachChatProposalContext = {
  id: string;
  status: string;
  reason: string | null;
  changeCount: number;
};

export type CoachChatStepsContext = {
  date: string;
  steps: number | null;
  target: number;
  hasEntry: boolean;
};

export type CoachChatNutritionContext = {
  date: string;
  mealType: string | null;
  description: string;
  status?: "eaten" | "planned";
  caloriesEstimated?: number | null;
  proteinGEstimated?: number | null;
  carbsGEstimated?: number | null;
  fatGEstimated?: number | null;
  estimationConfidence?: "high" | "medium" | "low" | null;
};

export type CoachNutritionTargetsContext = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type CoachNutritionDayContext = {
  targets: CoachNutritionTargetsContext | null;
  targetsNote: string | null;
  consumed: CoachNutritionTargetsContext;
  remaining: CoachNutritionTargetsContext;
  eaten: CoachChatNutritionContext[];
  planned: CoachChatNutritionContext[];
};

export type CoachChatEventContext = {
  eventDate: string;
  eventType: CoachEventType;
  summary: string;
};

export type CoachChatMessageContext = {
  role: CoachMessageRole;
  content: string;
};

export type CoachChatContext = {
  localDate: string;
  profile: CoachProfileContext;
  today: {
    checkIn: CoachChatCheckInContext | null;
    training: CoachChatTrainingContext[];
    plannedTraining: CoachChatPlanContext[];
    steps: CoachChatStepsContext | null;
    nutrition: CoachChatNutritionContext[];
    nutritionDay: CoachNutritionDayContext;
  };
  recent: {
    checkIns: CoachChatCheckInContext[];
    training: CoachChatTrainingContext[];
    plannedTraining: CoachChatPlanContext[];
    steps: CoachChatStepsContext[];
    nutrition: CoachChatNutritionContext[];
  };
  /** Full Monday–Sunday plan for the current local week (includes ids). */
  weekPlan: CoachChatPlanContext[];
  availabilityConstraints: CoachChatAvailabilityContext[];
  pendingProposals: CoachChatProposalContext[];
  coachEvents: CoachChatEventContext[];
  conversation: {
    id: string;
    title: string | null;
    needsTitle: boolean;
    messages: CoachChatMessageContext[];
  };
};

export type CoachChatGenerationResult = {
  rawText: string;
};

export type FoodEstimateGenerationResult = {
  rawText: string;
};

export type FoodEstimateRequest = {
  description: string;
  clarificationAnswer?: string | null;
  skipClarification?: boolean;
};

export interface AiProvider {
  generateCoachTake(context: CoachGenerationContext): Promise<string>;
  generateCoachChat(context: CoachChatContext): Promise<CoachChatGenerationResult>;
  estimateFoodNutrition(
    input: FoodEstimateRequest,
  ): Promise<FoodEstimateGenerationResult>;
}
