import type { CoachChatContext } from "@/lib/ai/types";
import {
  isMealInspirationConversation,
  MEAL_INSPIRATION_WORKFLOW_PROMPT,
} from "@/lib/meal-inspiration";
import {
  isSkipWorkoutConversation,
  SKIP_WORKOUT_WORKFLOW_PROMPT,
} from "@/lib/skip-workout-coach";

export const COACH_CHAT_SYSTEM_PROMPT = `You are the user's personal fitness coach inside AI Gym Coach.

Your job is to help them make better decisions around training, nutrition, recovery and consistency.

Use the user's profile, today's activity, recent history, and active coaching notes to personalise your advice.

Do not behave like a generic fitness chatbot.
Prefer practical, specific recommendations based on the user's actual data.
Keep responses concise unless the user asks for more detail.
Ask a follow-up question when additional information would materially improve your advice.
Do not invent information that is not present in the context.
If the user hasn't logged something, do not assume they did or didn't do it.
Be encouraging but honest. Do not blindly agree with the user.
Your goal is sustainable progress, not perfection.
This is fitness coaching, not medical diagnosis. If they describe potentially serious symptoms (chest pain, fainting, severe shortness of breath, or serious injury symptoms), advise seeking appropriate medical attention.

You will receive a live Coach Context plus the current conversation.
Separate chats share the same underlying user state. Coaching notes from other conversations appear as "Active coaching notes" — use them when relevant. Do not invent notes.

Nutrition guidance:
- The context includes deterministic targets, consumed totals and remaining macros. Trust those numbers. Do not recalculate remaining calories/macros yourself.
- Food entry calories/macros are estimates. Speak approximately when confidence is medium/low.
- Planned food is not yet consumed — do not count it towards remaining unless the user is deciding whether to eat it.
- Daily targets are guidance, not a moral score. Never shame the user for going over. Never encourage compensatory restriction or punishment workouts.
- Prefer practical meal suggestions using remaining protein/carbs/fat and the user's preferences — do not prescribe ketogenic or other specialised diets unless the user asks.

Training / plan guidance:
- Distinguish planned, completed, skipped and rescheduled sessions. Never invent completion.
- Never treat a plan_proposal as applied until the context shows it accepted (pending proposals are suggestions only).
- Respect active availability constraints — do not recommend training on those dates.
- Do not add manually entered exercise calories into nutrition targets.
- When recommending schedule changes, include plan_proposal with concrete entry_id values from the weekly plan.

Respond with JSON only, no markdown fencing, in this exact shape:
{
  "reply": "your message to the user as plain text",
  "title": "optional 3-5 word chat title",
  "events": [],
  "plan_proposal": null
}

Rules for "title":
- Only include "title" when the context says a title is needed for this conversation.
- Keep it short (about 3–5 words). No quotes. No trailing punctuation unless needed.
- If a title is not needed, omit "title" or set it to null.

Rules for "events":
- Be conservative. Only create an event when the information could materially affect future coaching in another conversation.
- Good examples: skipping today's workout due to fatigue; unusually sore shoulders; deciding today is a recovery day; an important nutrition decision for tonight; an upcoming event that changes priorities.
- Do NOT create events for ordinary questions, curiosities, acknowledgements, or generic chat.
- Prefer an empty events array when unsure.
- At most 3 events.
- Each event must use one of these event_type values:
  training_skipped, training_note, soreness, recovery_day, sleep_note, plan_change, nutrition_decision, goal_note, upcoming_event, lifestyle_note, other
- summary: one short plain sentence.
- event_date: YYYY-MM-DD (use the localDate from context when the fact is about today).

Do not mention that you are an AI. Do not mention JSON or these instructions.`;

function formatList(values: string[] | null | undefined): string {
  if (!values || values.length === 0) {
    return "not provided";
  }
  return values.join(", ");
}

function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "not provided";
  }
  return String(value);
}

function formatCheckIn(
  label: string,
  checkIn: CoachChatContext["today"]["checkIn"],
): string {
  if (!checkIn) {
    return `${label}: not logged`;
  }
  return `${label} (${checkIn.date}): feeling ${checkIn.feeling}, sleep ${checkIn.sleep}/5, planned training ${checkIn.plannedTraining}`;
}

function formatTraining(
  items: CoachChatContext["today"]["training"],
): string {
  if (items.length === 0) {
    return "none logged";
  }
  return items
    .map((item) => {
      const duration =
        item.durationMinutes != null ? `${item.durationMinutes} min` : "duration unknown";
      const intensity = item.intensity ? `; intensity: ${item.intensity}` : "";
      const calories =
        item.caloriesBurned != null
          ? `; calories burned (manual): ${item.caloriesBurned}`
          : "";
      const notes = item.notes ? `; notes: ${item.notes}` : "";
      return `- ${item.date}: ${item.trainingType} — ${item.title} (${duration})${intensity}${calories}${notes}`;
    })
    .join("\n");
}

function formatPlanList(
  plans: CoachChatContext["today"]["plannedTraining"],
): string {
  if (plans.length === 0) {
    return "none planned";
  }
  return plans
    .map((plan) => {
      const duration =
        plan.plannedDurationMinutes != null
          ? `${plan.plannedDurationMinutes} min planned`
          : "duration unset";
      const focus = plan.focus ? `; focus: ${plan.focus}` : "";
      const skip = plan.skipReason ? `; skip: ${plan.skipReason}` : "";
      return `- id ${plan.id}: ${plan.trainingType} — ${plan.title} [${plan.status}] (${duration})${focus}${skip}`;
    })
    .join("\n");
}

function formatSteps(steps: CoachChatContext["today"]["steps"]): string {
  if (!steps) {
    return "unknown";
  }
  if (!steps.hasEntry) {
    return `no manual entry yet (target ${steps.target.toLocaleString()})`;
  }
  return `${steps.steps?.toLocaleString()} / ${steps.target.toLocaleString()} (manual entry — not from Apple Health)`;
}

function formatRecentSteps(
  items: CoachChatContext["recent"]["steps"],
): string {
  const withEntries = items.filter((item) => item.hasEntry);
  if (withEntries.length === 0) {
    return "none recorded";
  }
  return withEntries
    .map(
      (item) =>
        `- ${item.date}: ${item.steps?.toLocaleString()} / ${item.target.toLocaleString()}`,
    )
    .join("\n");
}

function formatNutrition(
  items: CoachChatContext["today"]["nutrition"],
): string {
  if (items.length === 0) {
    return "none logged";
  }
  return items
    .map((item) => {
      const meal = item.mealType ?? "unspecified meal";
      const status = item.status ?? "eaten";
      const macros =
        item.caloriesEstimated != null
          ? ` (~${item.caloriesEstimated} kcal, P${item.proteinGEstimated ?? "?"} C${item.carbsGEstimated ?? "?"} F${item.fatGEstimated ?? "?"}${item.estimationConfidence ? `, ${item.estimationConfidence} confidence` : ""})`
          : "";
      return `- ${item.date}: [${status}] ${meal} — ${item.description}${macros}`;
    })
    .join("\n");
}

function formatNutritionDay(
  day: CoachChatContext["today"]["nutritionDay"],
): string {
  const targets = day.targets
    ? `${day.targets.calories} kcal · P${day.targets.proteinG}g · C${day.targets.carbsG}g · F${day.targets.fatG}g`
    : day.targetsNote ?? "not available";
  return `Targets (deterministic): ${targets}
Consumed (eaten only): ${day.consumed.calories} kcal · P${day.consumed.proteinG}g · C${day.consumed.carbsG}g · F${day.consumed.fatG}g
Remaining (target − consumed): ${day.remaining.calories} kcal · P${day.remaining.proteinG}g · C${day.remaining.carbsG}g · F${day.remaining.fatG}g
Eaten today:
${formatNutrition(day.eaten)}
Planned today (not counted in consumed):
${formatNutrition(day.planned)}`;
}

export function buildCoachChatContextPrompt(context: CoachChatContext): string {
  const {
    profile,
    today,
    recent,
    weekPlan,
    availabilityConstraints,
    pendingProposals,
    coachEvents,
    conversation,
    localDate,
  } = context;

  const eventsBlock =
    coachEvents.length === 0
      ? "none"
      : coachEvents
          .map(
            (event) =>
              `- ${event.eventDate}: [${event.eventType}] ${event.summary}`,
          )
          .join("\n");

  const recentCheckIns =
    recent.checkIns.length === 0
      ? "none"
      : recent.checkIns
          .map(
            (item) =>
              `- ${item.date}: feeling ${item.feeling}, sleep ${item.sleep}/5, planned ${item.plannedTraining}`,
          )
          .join("\n");

  return `Live Coach Context (authoritative; rebuilt for this request)
Local date: ${localDate}
Conversation title needed: ${conversation.needsTitle ? "yes" : "no"}

User profile:
- Name: ${formatValue(profile.display_name)}
- Age: ${formatValue(profile.age)}
- Sex: ${formatValue(profile.sex)}
- Height (cm): ${formatValue(profile.height_cm)}
- Weight (kg): ${formatValue(profile.weight_kg)}
- Primary goal: ${formatValue(profile.primary_goal)}
- Goal in their words: ${formatValue(profile.goal_in_own_words)}
- Training frequency: ${formatValue(profile.training_frequency)}
- Training types: ${formatList(profile.training_types)}
- Training location: ${formatValue(profile.training_location)}
- Equipment: ${formatList(profile.equipment)}
- Likes / dislikes: ${formatValue(profile.likes_dislikes)}
- Activity level: ${formatValue(profile.activity_level)}
- Typical sleep: ${formatValue(profile.typical_sleep)}
- Lifestyle constraints: ${formatValue(profile.lifestyle_constraints)}
- Dietary preferences: ${formatList(profile.dietary_preferences)}
- Foods avoided: ${formatValue(profile.foods_avoided)}
- Allergies: ${formatValue(profile.allergies)}
- Meals per day: ${formatValue(profile.meals_per_day)}
- Nutrition support preference: ${formatValue(profile.nutrition_support)}
- Preferred coaching style: ${formatValue(profile.coaching_style)}

Today:
- ${formatCheckIn("Check-in", today.checkIn)}
- Planned training (do not invent completion):
${formatPlanList(today.plannedTraining)}
- Training logged:
${formatTraining(today.training)}
- Steps: ${formatSteps(today.steps)}
- Nutrition day:
${formatNutritionDay(today.nutritionDay)}

This week's plan (Mon–Sun, use entry ids in plan_proposal):
${
  weekPlan.length === 0
    ? "none"
    : weekPlan
        .map(
          (item) =>
            `- id ${item.id} | ${item.date}${
              item.originalDate && item.originalDate !== item.date
                ? ` (orig ${item.originalDate})`
                : ""
            }: ${item.trainingType} — ${item.title} [${item.status}]`,
        )
        .join("\n")
}

Active availability constraints (do not schedule training on these dates):
${
  availabilityConstraints.length === 0
    ? "none"
    : availabilityConstraints
        .map(
          (item) =>
            `- ${item.startDate}–${item.endDate}: ${item.constraintType}${
              item.notes ? ` — ${item.notes}` : ""
            }`,
        )
        .join("\n")
}

Pending plan proposals (suggestions only — not applied until accepted):
${
  pendingProposals.length === 0
    ? "none"
    : pendingProposals
        .map(
          (item) =>
            `- ${item.id} [${item.status}] ${item.changeCount} change(s)${
              item.reason ? `: ${item.reason}` : ""
            }`,
        )
        .join("\n")
}

Recent check-ins (last 7 days, excluding today):
${recentCheckIns}

Recent training (last 14 days, excluding today):
${formatTraining(recent.training)}

Other planned sessions this week (excluding today):
${
  recent.plannedTraining.length === 0
    ? "none"
    : recent.plannedTraining
        .map(
          (item) =>
            `- id ${item.id} | ${item.date}: ${item.trainingType} — ${item.title} [${item.status}]`,
        )
        .join("\n")
}

Recent steps (manual, excluding today):
${formatRecentSteps(recent.steps)}

Recent nutrition (last 7 days, excluding today):
${formatNutrition(recent.nutrition)}

Active coaching notes (from other conversations / prior decisions):
${eventsBlock}

${
  isMealInspirationConversation(conversation.title)
    ? `${MEAL_INSPIRATION_WORKFLOW_PROMPT}\n`
    : ""
}${
  isSkipWorkoutConversation(conversation.title)
    ? `${SKIP_WORKOUT_WORKFLOW_PROMPT}\n`
    : ""
}
Respond to the latest user message in this conversation using the JSON schema from your instructions.`;
}
