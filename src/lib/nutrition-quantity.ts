/**
 * Quantity parsing and proportional macro scaling for food logging.
 * Scale saved nutrition exactly once — never re-estimate when a reliable base exists.
 */

export type MacroTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

/** Extract the first gram amount from free text (e.g. "80g", "40 g", "80 grams"). */
export function parseGramsFromText(text: string): number | null {
  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:g|grams?|grammes?)\b/i,
  );
  if (!match) {
    return null;
  }
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > 5000) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

/**
 * Strip quantity phrases so product titles can be compared across servings.
 * "80g Waitrose berry granola (2 servings)" → "waitrose berry granola"
 */
export function normalizeFoodIdentity(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:g|grams?|grammes?|ml|millilitres?|milliliters?|kg|oz|cups?|tbsp|tsp|servings?|portions?|x|×)\b/gi,
      " ",
    )
    .replace(/\b\d+(?:[.,]\d+)?\s*[x×]\b/gi, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function foodIdentitiesMatch(a: string, b: string): boolean {
  const left = normalizeFoodIdentity(a);
  const right = normalizeFoodIdentity(b);
  if (!left || !right) {
    return false;
  }
  return left === right || left.includes(right) || right.includes(left);
}

function roundMacro(value: number, field: keyof MacroTotals): number {
  if (field === "calories") {
    return Math.max(0, Math.round(value));
  }
  return Math.max(0, Math.round(value * 10) / 10);
}

/** Scale macros by a unitless factor exactly once. */
export function scaleMacrosByFactor(
  base: MacroTotals,
  factor: number,
): MacroTotals {
  const safe = Number.isFinite(factor) && factor > 0 ? factor : 1;
  return {
    calories: roundMacro(base.calories * safe, "calories"),
    proteinG: roundMacro(base.proteinG * safe, "proteinG"),
    carbsG: roundMacro(base.carbsG * safe, "carbsG"),
    fatG: roundMacro(base.fatG * safe, "fatG"),
  };
}

/**
 * Scale macros from a known gram amount to a new gram amount.
 * Returns null when either mass is missing or invalid.
 */
export function scaleMacrosByGrams(
  base: MacroTotals,
  fromGrams: number,
  toGrams: number,
): MacroTotals | null {
  if (
    !Number.isFinite(fromGrams) ||
    !Number.isFinite(toGrams) ||
    fromGrams <= 0 ||
    toGrams <= 0
  ) {
    return null;
  }
  return scaleMacrosByFactor(base, toGrams / fromGrams);
}

/**
 * Rewrite a description so the new quantity is reflected (avoids reuse compounding).
 * Prefer updating an existing gram amount; otherwise append a clear multiplier.
 */
export function rewriteDescriptionForQuantity(
  description: string,
  input: {
    factor?: number;
    fromGrams?: number | null;
    toGrams?: number | null;
  },
): string {
  const trimmed = description.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (
    input.fromGrams != null &&
    input.toGrams != null &&
    input.fromGrams > 0 &&
    input.toGrams > 0
  ) {
    const toLabel = formatGrams(input.toGrams);
    const fromToken = formatGrams(input.fromGrams).replace(".", "[.,]");
    const replaced = trimmed.replace(
      new RegExp(`\\b${fromToken}(\\s*)(g|grams?|grammes?)\\b`, "i"),
      `${toLabel}$1$2`,
    );
    if (replaced !== trimmed) {
      return replaced;
    }
    // No matching grams phrase — append the new amount.
    return `${trimmed} (${toLabel} g)`;
  }

  const factor = input.factor;
  if (factor != null && Number.isFinite(factor) && Math.abs(factor - 1) > 0.01) {
    const label = Number.isInteger(factor) ? `${factor}` : factor.toFixed(1);
    return `${trimmed} (×${label})`;
  }

  return trimmed;
}

function formatGrams(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

/**
 * Detect when a description already embeds a portion and a multiplier would
 * double-count (e.g. "80g granola" + 2×).
 */
export function looksAlreadyPortioned(description: string): boolean {
  return (
    parseGramsFromText(description) != null ||
    /\b\d+(?:[.,]\d+)?\s*(?:servings?|portions?)\b/i.test(description) ||
    /\(\s*\d+(?:[.,]\d+)?\s*g\s*\)/i.test(description)
  );
}
