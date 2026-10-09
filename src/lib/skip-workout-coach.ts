/** Coach workflow when the user skips a planned workout. */

import {
  labelForSkipReason,
  type SkipReasonId,
} from "@/lib/training-plan";

export const SKIP_WORKOUT_CHAT_TITLE = "Reschedule workout";

export function buildSkipWorkoutSeedMessage(input: {
  title: string;
  planDate: string;
  reason: SkipReasonId;
  notes?: string | null;
}): string {
  const reasonLabel = labelForSkipReason(input.reason);
  const notes =
    typeof input.notes === "string" && input.notes.trim()
      ? ` Extra context: ${input.notes.trim()}`
      : "";
  return `I need to skip my planned workout “${input.title}” on ${input.planDate}. Reason: ${reasonLabel}.${notes} Please help me decide what to do next — move it, shorten it, substitute something, or leave it skipped. Do not change my plan until I confirm.`;
}

export const SKIP_WORKOUT_WORKFLOW_PROMPT = `SKIP / RESCHEDULE WORKFLOW (active for this conversation):
The user skipped a planned workout. You are the first point of call.

Follow this sequence:
1. Acknowledge the reason supportively (no guilt).
2. Review the full weekly plan, completed sessions, weekly target, and availability constraints in context.
3. Recommend one sensible next action (move, shorten, substitute, leave skipped, or reduce weekly target if needed).
4. Explain briefly why.
5. Ask whether they want to proceed.
6. Only include a plan_proposal in your JSON when you are ready for the user to confirm specific changes.
7. Never assume a proposal was accepted. Never invent availability.

Rules:
- Do not cram missed workouts into consecutive days.
- Do not recommend training on dates covered by active availability constraints.
- If dates are unclear, ask one concise follow-up.
- Temporary travel/unavailability is not permanent preference.
- Distinguishing suggestion vs confirmed change is mandatory.

When proposing concrete plan changes, include plan_proposal in your JSON:
{
  "reply": "...",
  "title": optional,
  "events": [],
  "plan_proposal": {
    "reason": "short explanation",
    "changes": [
      { "entry_id": "<uuid from context>", "action": "move", "to_date": "YYYY-MM-DD" },
      { "entry_id": "<uuid>", "action": "shorten", "planned_duration_minutes": 30 },
      { "entry_id": "<uuid>", "action": "skip" },
      { "entry_id": "<uuid>", "action": "replace", "training_type": "hiit", "title": "..." },
      { "entry_id": "<uuid>", "action": "leave_skipped" }
    ]
  }
}

Only propose changes for entry ids that appear in the weekly plan context.
If the user mentions new availability (away, holiday, no gym), include a lifestyle_note or upcoming_event, and ask for start/end dates if missing.
Do not apply changes yourself — the app applies them only after the user accepts the proposal.`;

export function isSkipWorkoutConversation(title: string | null): boolean {
  return title === SKIP_WORKOUT_CHAT_TITLE;
}
