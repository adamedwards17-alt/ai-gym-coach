import type {
  CoachTakeSource,
  FeelingId,
  PlanId,
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

export interface AiProvider {
  generateCoachTake(context: CoachGenerationContext): Promise<string>;
}
