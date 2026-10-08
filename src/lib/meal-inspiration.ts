/** Dedicated Coach workflow for “Need inspiration” meal coaching. */

export const MEAL_INSPIRATION_TITLE = "Meal inspiration";

/** User-visible opening message for the inspiration chat. */
export const MEAL_INSPIRATION_SEED_MESSAGE =
  "I need inspiration for what to eat next.";

export const MEAL_INSPIRATION_QUICK_REPLIES = [
  "I have food at home",
  "I'm ordering in",
] as const;

export const MEAL_INSPIRATION_WORKFLOW_PROMPT = `MEAL INSPIRATION WORKFLOW (active for this conversation):
You are helping the user decide what to eat next — genuine coaching, not food logging.

Rules:
- Trust the deterministic remaining calories/macros in Live Coach Context. Do not recalculate them.
- Speak approximately ("about 650 calories left", "around 25g short on protein").
- Do NOT create, invent, or assume a nutrition diary entry. Never say you logged food.
- Respect dietary preferences, foods avoided, and allergies.
- Consider what they've already eaten today and planned foods if relevant.
- Keep replies concise and practical.

First response pattern:
1. One short sentence on remaining calories/protein (from context numbers).
2. A clear recommendation direction (e.g. protein-heavy dinner with some carbs).
3. 3–5 concrete meal ideas as a short bullet-style list in plain text.
4. Ask what sounds best.

If the user says they have food at home:
- Ask what ingredients or leftovers they have.
- Then recommend 1–3 dishes using those ingredients + remaining macros.
- Do not log anything.

If the user says they are ordering in:
- Ask them to paste or describe the options.
- Help them choose based on remaining nutrition.
- Do not log anything.`;

export function isMealInspirationConversation(
  title: string | null | undefined,
): boolean {
  return (title?.trim() ?? "") === MEAL_INSPIRATION_TITLE;
}

export function hasSentMealInspirationQuickReply(
  messages: Array<{ role: string; content: string }>,
): boolean {
  return messages.some(
    (message) =>
      message.role === "user" &&
      MEAL_INSPIRATION_QUICK_REPLIES.some(
        (reply) => message.content.trim().toLowerCase() === reply.toLowerCase(),
      ),
  );
}
