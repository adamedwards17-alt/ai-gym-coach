import type {
  CoachChatAvailabilityContext,
  CoachChatCheckInContext,
  CoachChatContext,
  CoachChatEventContext,
  CoachChatNutritionContext,
  CoachChatPlanContext,
  CoachChatProposalContext,
  CoachChatStepsContext,
  CoachChatTrainingContext,
  CoachNutritionDayContext,
  CoachProfileContext,
} from "@/lib/ai/types";
import { resolveDailyStepTarget } from "@/lib/activity-steps";
import {
  isCoachEventType,
  isCoachMessageRole,
  shiftCoachDate,
  truncateMessagesForModel,
} from "@/lib/coach";
import {
  ensureNutritionTargetsForUser,
  summariseNutritionDay,
  toNutritionEntryRecord,
} from "@/lib/nutrition-day";
import { isEstimationConfidence, isNutritionEntryStatus } from "@/lib/nutrition";
import { createClient } from "@/lib/supabase/server";
import {
  endOfWeekSunday,
  startOfWeekMonday,
} from "@/lib/training-week";
import { isPlanEntryStatus } from "@/lib/training";

const PROFILE_SELECT = [
  "display_name",
  "age",
  "sex",
  "height_cm",
  "weight_kg",
  "primary_goal",
  "goal_in_own_words",
  "training_frequency",
  "training_types",
  "training_location",
  "equipment",
  "likes_dislikes",
  "activity_level",
  "typical_sleep",
  "lifestyle_constraints",
  "dietary_preferences",
  "foods_avoided",
  "allergies",
  "meals_per_day",
  "nutrition_support",
  "coaching_style",
  "daily_step_target",
].join(", ");

function toProfileContext(row: Record<string, unknown>): CoachProfileContext {
  return {
    display_name:
      typeof row.display_name === "string" ? row.display_name : null,
    age: typeof row.age === "number" ? row.age : null,
    sex: typeof row.sex === "string" ? row.sex : null,
    height_cm: typeof row.height_cm === "number" ? row.height_cm : null,
    weight_kg: typeof row.weight_kg === "number" ? row.weight_kg : null,
    primary_goal:
      typeof row.primary_goal === "string" ? row.primary_goal : null,
    goal_in_own_words:
      typeof row.goal_in_own_words === "string"
        ? row.goal_in_own_words
        : null,
    training_frequency:
      typeof row.training_frequency === "string"
        ? row.training_frequency
        : null,
    training_types: Array.isArray(row.training_types)
      ? row.training_types.filter((v): v is string => typeof v === "string")
      : null,
    training_location:
      typeof row.training_location === "string"
        ? row.training_location
        : null,
    equipment: Array.isArray(row.equipment)
      ? row.equipment.filter((v): v is string => typeof v === "string")
      : null,
    likes_dislikes:
      typeof row.likes_dislikes === "string" ? row.likes_dislikes : null,
    activity_level:
      typeof row.activity_level === "string" ? row.activity_level : null,
    typical_sleep:
      typeof row.typical_sleep === "string" ? row.typical_sleep : null,
    lifestyle_constraints:
      typeof row.lifestyle_constraints === "string"
        ? row.lifestyle_constraints
        : null,
    dietary_preferences: Array.isArray(row.dietary_preferences)
      ? row.dietary_preferences.filter(
          (v): v is string => typeof v === "string",
        )
      : null,
    foods_avoided:
      typeof row.foods_avoided === "string" ? row.foods_avoided : null,
    allergies: typeof row.allergies === "string" ? row.allergies : null,
    meals_per_day:
      typeof row.meals_per_day === "number" ? row.meals_per_day : null,
    nutrition_support:
      typeof row.nutrition_support === "string"
        ? row.nutrition_support
        : null,
    coaching_style:
      typeof row.coaching_style === "string" ? row.coaching_style : null,
  };
}

function emptyProfile(): CoachProfileContext {
  return toProfileContext({});
}

export async function buildCoachContext(input: {
  userId: string;
  conversationId: string;
  localDate: string;
}): Promise<CoachChatContext> {
  const supabase = await createClient();
  const checkInFrom = shiftCoachDate(input.localDate, -7);
  const trainingFrom = shiftCoachDate(input.localDate, -14);
  const nutritionFrom = shiftCoachDate(input.localDate, -7);
  const eventsFrom = shiftCoachDate(input.localDate, -14);
  const weekStart = startOfWeekMonday(input.localDate);
  const weekEnd = endOfWeekSunday(input.localDate);

  const [
    profileResult,
    conversationResult,
    messagesResult,
    checkInsResult,
    trainingResult,
    planResult,
    stepsResult,
    nutritionResult,
    eventsResult,
    constraintsResult,
    proposalsResult,
    nutritionTargetsEnsured,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", input.userId)
      .maybeSingle(),
    supabase
      .from("coach_conversations")
      .select("id, title")
      .eq("id", input.conversationId)
      .eq("user_id", input.userId)
      .maybeSingle(),
    supabase
      .from("coach_messages")
      .select("role, content, created_at")
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: true })
      .limit(80),
    supabase
      .from("daily_check_ins")
      .select("check_in_date, feeling, sleep_rating, planned_training")
      .eq("user_id", input.userId)
      .gte("check_in_date", checkInFrom)
      .lte("check_in_date", input.localDate)
      .order("check_in_date", { ascending: false }),
    supabase
      .from("training_sessions")
      .select(
        "session_date, training_type, title, duration_minutes, notes, intensity, calories_burned, created_at",
      )
      .eq("user_id", input.userId)
      .gte("session_date", trainingFrom)
      .lte("session_date", input.localDate)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("training_plan_entries")
      .select(
        "id, plan_date, original_plan_date, training_type, title, focus, planned_duration_minutes, status, training_session_id, skip_reason",
      )
      .eq("user_id", input.userId)
      .gte("plan_date", weekStart)
      .lte("plan_date", weekEnd)
      .order("plan_date", { ascending: true }),
    supabase
      .from("daily_steps")
      .select("step_date, steps")
      .eq("user_id", input.userId)
      .gte("step_date", checkInFrom)
      .lte("step_date", input.localDate)
      .order("step_date", { ascending: false }),
    supabase
      .from("nutrition_entries")
      .select(
        "id, logged_date, meal_type, description, display_name, search_aliases, status, calories_estimated, protein_g_estimated, carbs_g_estimated, fat_g_estimated, estimation_confidence, estimation_source, created_at",
      )
      .eq("user_id", input.userId)
      .gte("logged_date", nutritionFrom)
      .lte("logged_date", input.localDate)
      .order("logged_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("coach_events")
      .select("event_date, event_type, summary, created_at")
      .eq("user_id", input.userId)
      .eq("active", true)
      .gte("event_date", eventsFrom)
      .lte("event_date", input.localDate)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("availability_constraints")
      .select("id, start_date, end_date, constraint_type, notes, active")
      .eq("user_id", input.userId)
      .eq("active", true)
      .gte("end_date", input.localDate)
      .order("start_date", { ascending: true })
      .limit(20),
    supabase
      .from("training_plan_proposals")
      .select("id, status, reason, changes, created_at")
      .eq("user_id", input.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5),
    ensureNutritionTargetsForUser(supabase, input.userId),
  ]);

  if (profileResult.error) {
    console.error("[coach-context] Profile:", profileResult.error.message);
  }
  if (conversationResult.error) {
    console.error(
      "[coach-context] Conversation:",
      conversationResult.error.message,
    );
  }
  if (messagesResult.error) {
    console.error("[coach-context] Messages:", messagesResult.error.message);
  }
  if (checkInsResult.error) {
    console.error("[coach-context] Check-ins:", checkInsResult.error.message);
  }
  if (trainingResult.error) {
    console.error("[coach-context] Training:", trainingResult.error.message);
  }
  if (planResult.error) {
    console.error("[coach-context] Plan:", planResult.error.message);
  }
  if (stepsResult.error) {
    console.error("[coach-context] Steps:", stepsResult.error.message);
  }
  if (constraintsResult.error) {
    console.error(
      "[coach-context] Availability:",
      constraintsResult.error.message,
    );
  }
  if (proposalsResult.error) {
    console.error(
      "[coach-context] Proposals:",
      proposalsResult.error.message,
    );
  }
  if (nutritionResult.error) {
    console.error("[coach-context] Nutrition:", nutritionResult.error.message);
  }
  if (eventsResult.error) {
    console.error("[coach-context] Events:", eventsResult.error.message);
  }

  const profile = profileResult.data
    ? toProfileContext(profileResult.data as unknown as Record<string, unknown>)
    : emptyProfile();

  const nutritionEntries = (nutritionResult.data ?? [])
    .map((row) => toNutritionEntryRecord(row as Record<string, unknown>))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const nutritionDaySummary = summariseNutritionDay({
    localDate: input.localDate,
    targets: nutritionTargetsEnsured.targets,
    targetsStatus: nutritionTargetsEnsured.status,
    targetsMessage: nutritionTargetsEnsured.message,
    entries: nutritionEntries,
  });

  const nutritionDay: CoachNutritionDayContext = {
    targets: nutritionDaySummary.targets
      ? {
          calories: nutritionDaySummary.targets.daily_calories,
          proteinG: nutritionDaySummary.targets.protein_g,
          carbsG: nutritionDaySummary.targets.carbs_g,
          fatG: nutritionDaySummary.targets.fat_g,
        }
      : null,
    targetsNote: nutritionDaySummary.targetsMessage,
    consumed: {
      calories: nutritionDaySummary.consumed.calories,
      proteinG: nutritionDaySummary.consumed.proteinG,
      carbsG: nutritionDaySummary.consumed.carbsG,
      fatG: nutritionDaySummary.consumed.fatG,
    },
    remaining: {
      calories: nutritionDaySummary.remaining.calories,
      proteinG: nutritionDaySummary.remaining.proteinG,
      carbsG: nutritionDaySummary.remaining.carbsG,
      fatG: nutritionDaySummary.remaining.fatG,
    },
    eaten: nutritionDaySummary.eatenEntries.map((entry) => ({
      date: entry.logged_date,
      mealType: entry.meal_type,
      description: entry.description,
      status: entry.status,
      caloriesEstimated: entry.calories_estimated,
      proteinGEstimated: entry.protein_g_estimated,
      carbsGEstimated: entry.carbs_g_estimated,
      fatGEstimated: entry.fat_g_estimated,
      estimationConfidence: entry.estimation_confidence,
    })),
    planned: nutritionDaySummary.plannedEntries.map((entry) => ({
      date: entry.logged_date,
      mealType: entry.meal_type,
      description: entry.description,
      status: entry.status,
      caloriesEstimated: entry.calories_estimated,
      proteinGEstimated: entry.protein_g_estimated,
      carbsGEstimated: entry.carbs_g_estimated,
      fatGEstimated: entry.fat_g_estimated,
      estimationConfidence: entry.estimation_confidence,
    })),
  };

  const checkIns: CoachChatCheckInContext[] = (checkInsResult.data ?? [])
    .map((row) => {
      const record = row as Record<string, unknown>;
      if (
        typeof record.check_in_date !== "string" ||
        typeof record.feeling !== "string" ||
        typeof record.sleep_rating !== "number" ||
        typeof record.planned_training !== "string"
      ) {
        return null;
      }
      return {
        date: record.check_in_date,
        feeling: record.feeling,
        sleep: record.sleep_rating,
        plannedTraining: record.planned_training,
      };
    })
    .filter((row): row is CoachChatCheckInContext => row !== null);

  const training: CoachChatTrainingContext[] = [];
  for (const row of trainingResult.data ?? []) {
    const record = row as Record<string, unknown>;
    if (
      typeof record.session_date !== "string" ||
      typeof record.training_type !== "string" ||
      typeof record.title !== "string"
    ) {
      continue;
    }
    training.push({
      date: record.session_date,
      trainingType: record.training_type,
      title: record.title,
      durationMinutes:
        typeof record.duration_minutes === "number"
          ? record.duration_minutes
          : null,
      notes: typeof record.notes === "string" ? record.notes : null,
      intensity:
        typeof record.intensity === "string" ? record.intensity : null,
      caloriesBurned:
        typeof record.calories_burned === "number"
          ? record.calories_burned
          : null,
      status: "logged",
    });
  }

  const weekPlan: CoachChatPlanContext[] = [];
  for (const row of planResult.data ?? []) {
    const record = row as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.plan_date !== "string" ||
      typeof record.training_type !== "string" ||
      typeof record.title !== "string" ||
      !isPlanEntryStatus(record.status)
    ) {
      continue;
    }
    weekPlan.push({
      id: record.id,
      date: record.plan_date,
      originalDate:
        typeof record.original_plan_date === "string"
          ? record.original_plan_date
          : null,
      trainingType: record.training_type,
      title: record.title,
      focus: typeof record.focus === "string" ? record.focus : null,
      plannedDurationMinutes:
        typeof record.planned_duration_minutes === "number"
          ? record.planned_duration_minutes
          : null,
      status: record.status,
      completed: record.status === "completed",
      skipReason:
        typeof record.skip_reason === "string" ? record.skip_reason : null,
      linkedSessionId:
        typeof record.training_session_id === "string"
          ? record.training_session_id
          : null,
    });
  }

  const plannedTraining = weekPlan.filter(
    (item) => item.status !== "rescheduled",
  );

  const availabilityConstraints: CoachChatAvailabilityContext[] = (
    constraintsResult.data ?? []
  )
    .map((row) => {
      const record = row as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        typeof record.start_date !== "string" ||
        typeof record.end_date !== "string" ||
        typeof record.constraint_type !== "string"
      ) {
        return null;
      }
      return {
        id: record.id,
        startDate: record.start_date,
        endDate: record.end_date,
        constraintType: record.constraint_type,
        notes: typeof record.notes === "string" ? record.notes : null,
      };
    })
    .filter((row): row is CoachChatAvailabilityContext => row !== null);

  const pendingProposals: CoachChatProposalContext[] = (
    proposalsResult.data ?? []
  )
    .map((row) => {
      const record = row as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.status !== "string") {
        return null;
      }
      const changes = Array.isArray(record.changes) ? record.changes : [];
      return {
        id: record.id,
        status: record.status,
        reason: typeof record.reason === "string" ? record.reason : null,
        changeCount: changes.length,
      };
    })
    .filter((row): row is CoachChatProposalContext => row !== null);

  const profileRow = profileResult.data as unknown as Record<
    string,
    unknown
  > | null;
  const stepTarget = resolveDailyStepTarget(
    typeof profileRow?.daily_step_target === "number"
      ? profileRow.daily_step_target
      : null,
  );

  const stepsByDate = new Map<string, number>();
  for (const row of stepsResult.data ?? []) {
    const record = row as Record<string, unknown>;
    if (
      typeof record.step_date === "string" &&
      typeof record.steps === "number"
    ) {
      stepsByDate.set(record.step_date, record.steps);
    }
  }

  const stepsHistory: CoachChatStepsContext[] = [];
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = shiftCoachDate(input.localDate, -offset);
    const steps = stepsByDate.get(date) ?? null;
    stepsHistory.push({
      date,
      steps,
      target: stepTarget,
      hasEntry: steps != null,
    });
  }

  const nutrition: CoachChatNutritionContext[] = nutritionEntries.map(
    (entry) => ({
      date: entry.logged_date,
      mealType: entry.meal_type,
      description: entry.description,
      status: isNutritionEntryStatus(entry.status) ? entry.status : "eaten",
      caloriesEstimated: entry.calories_estimated,
      proteinGEstimated: entry.protein_g_estimated,
      carbsGEstimated: entry.carbs_g_estimated,
      fatGEstimated: entry.fat_g_estimated,
      estimationConfidence: isEstimationConfidence(entry.estimation_confidence)
        ? entry.estimation_confidence
        : null,
    }),
  );

  const coachEvents: CoachChatEventContext[] = (eventsResult.data ?? [])
    .map((row) => {
      const record = row as Record<string, unknown>;
      if (
        typeof record.event_date !== "string" ||
        !isCoachEventType(record.event_type) ||
        typeof record.summary !== "string"
      ) {
        return null;
      }
      return {
        eventDate: record.event_date,
        eventType: record.event_type,
        summary: record.summary,
      };
    })
    .filter((row): row is CoachChatEventContext => row !== null);

  const messages = truncateMessagesForModel(
    (messagesResult.data ?? [])
      .map((row) => {
        const record = row as Record<string, unknown>;
        if (
          !isCoachMessageRole(record.role) ||
          typeof record.content !== "string"
        ) {
          return null;
        }
        return { role: record.role, content: record.content };
      })
      .filter(
        (row): row is { role: "user" | "assistant"; content: string } =>
          row !== null,
      ),
  );

  const conversationRow = conversationResult.data as
    | { id: string; title: string | null }
    | null;

  return {
    localDate: input.localDate,
    profile,
    today: {
      checkIn:
        checkIns.find((item) => item.date === input.localDate) ?? null,
      training: training.filter((item) => item.date === input.localDate),
      plannedTraining: plannedTraining.filter(
        (item) => item.date === input.localDate,
      ),
      steps:
        stepsHistory.find((item) => item.date === input.localDate) ?? null,
      nutrition: nutrition.filter((item) => item.date === input.localDate),
      nutritionDay,
    },
    recent: {
      checkIns: checkIns.filter((item) => item.date !== input.localDate),
      training: training.filter((item) => item.date !== input.localDate),
      plannedTraining: plannedTraining.filter(
        (item) => item.date !== input.localDate,
      ),
      steps: stepsHistory.filter((item) => item.date !== input.localDate),
      nutrition: nutrition.filter((item) => item.date !== input.localDate),
    },
    weekPlan,
    availabilityConstraints,
    pendingProposals,
    coachEvents,
    conversation: {
      id: input.conversationId,
      title: conversationRow?.title ?? null,
      needsTitle: !conversationRow?.title,
      messages,
    },
  };
}
