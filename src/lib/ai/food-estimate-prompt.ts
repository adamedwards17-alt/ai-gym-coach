export const FOOD_ESTIMATE_SYSTEM_PROMPT = `You estimate nutrition for natural-language food descriptions for a fitness coaching app.

Return JSON only, no markdown fencing.

If the description is missing a quantity that materially changes the estimate, AND you have not been told to skip clarification, return ONLY:
{
  "needs_clarification": true,
  "question": "one short quantity question"
}

Ask at most one question. Keep it short. Examples:
- "How many eggs and slices of toast?"
- "How much chicken?"

Do NOT ask for clarification when:
- quantities are already clear (e.g. "2 eggs and 2 slices of toast")
- the user already answered a clarification
- you were told to skip clarification / assume typical portions
- the meal is a named previous reuse with full nutrition already known

Otherwise return:
{
  "needs_clarification": false,
  "items": [
    {
      "description": "short item label",
      "calories": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0,
      "confidence": "high"
    }
  ],
  "totals": {
    "calories": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0
  },
  "confidence": "medium"
}

Rules:
- Estimate calories and macros from the description. Do not invent barcode-level precision.
- Split into sensible items when the user lists multiple foods.
- totals must equal the sum of items (within rounding).
- confidence: "high" for clear quantities of common foods; "medium" for reasonable assumptions; "low" for vague/restaurant/unknown portions or when clarification was skipped.
- Use whole numbers for calories and grams.
- Do not include advice, commentary, or non-JSON text.`;

export function buildFoodEstimateUserPrompt(input: {
  description: string;
  clarificationAnswer?: string | null;
  skipClarification?: boolean;
}): string {
  const parts = [
    `Food description:\n"""${input.description.trim()}"""`,
  ];

  if (input.clarificationAnswer?.trim()) {
    parts.push(
      `User clarification answer:\n"""${input.clarificationAnswer.trim()}"""`,
    );
    parts.push(
      "Use the clarification. Do not ask another clarification question. Return a nutrition estimate.",
    );
  } else if (input.skipClarification) {
    parts.push(
      "The user skipped clarification. Assume typical single-serving portions, set confidence to low or medium as appropriate, and return a nutrition estimate. Do not ask for clarification.",
    );
  } else {
    parts.push(
      "If a missing quantity materially affects the estimate, ask exactly one short clarification question. Otherwise return the nutrition estimate.",
    );
  }

  return parts.join("\n\n");
}
