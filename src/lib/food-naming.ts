/**
 * Deterministic food display names and searchable aliases.
 * Gemini may suggest a display_name; heuristics always produce aliases.
 */

export function normalizeFoodText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Produce a concise diary title from a free-text description.
 * Prefer a short dish name when the description is an ingredient list.
 */
export function deriveDisplayName(
  description: string,
  suggested?: string | null,
): string {
  const suggestion = suggested?.trim();
  if (suggestion && suggestion.length >= 2 && suggestion.length <= 48) {
    return suggestion;
  }

  const trimmed = description.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "Food";
  }

  const lower = trimmed.toLowerCase();

  // Ingredient-list omelette / scramble heuristics.
  if (
    /\beggs?\b/.test(lower) &&
    (/\bspinach\b|\bmushroom|\bpepper|\btomato|\bonion|\bcoconut oil\b/.test(
      lower,
    ) ||
      /\begg whites?\b/.test(lower))
  ) {
    if (/\bscrambl/.test(lower)) {
      return "Scrambled eggs";
    }
    return "Omelette";
  }

  if (/\bcappuccino\b/.test(lower)) {
    return "Cappuccino";
  }
  if (/\blatte\b/.test(lower)) {
    return "Latte";
  }
  if (/\b(black )?coffee\b/.test(lower) || /\bespresso\b/.test(lower)) {
    return "Coffee";
  }
  if (/\bprotein bar\b/.test(lower)) {
    return "Protein bar";
  }

  // If it looks like a short name already, keep it.
  if (trimmed.length <= 36 && !/,/.test(trimmed) && trimmed.split(" ").length <= 5) {
    return titleCase(trimmed);
  }

  // First clause before comma / "with".
  const firstClause = trimmed.split(/,| with /i)[0]?.trim() ?? trimmed;
  if (firstClause.length > 0 && firstClause.length <= 40) {
    return titleCase(firstClause);
  }

  return titleCase(trimmed.slice(0, 40).trim());
}

/**
 * Build searchable aliases from display name + full description.
 */
export function buildSearchAliases(input: {
  displayName: string;
  description: string;
  brand?: string | null;
  extra?: string[];
}): string[] {
  const tokens = new Set<string>();
  const add = (value: string | null | undefined) => {
    const normalized = normalizeFoodText(value ?? "");
    if (normalized.length >= 2) {
      tokens.add(normalized);
    }
  };

  add(input.displayName);
  add(input.description);
  add(input.brand ?? null);

  for (const extra of input.extra ?? []) {
    add(extra);
  }

  // Split description into ingredient-like fragments.
  const parts = input.description
    .split(/,| and | with |\+|\/|&/i)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    add(part);
    // Drop leading quantities: "2 large eggs" → "large eggs", "eggs"
    const withoutQty = part.replace(
      /^\d+(\.\d+)?\s*(x|×)?\s*/i,
      "",
    );
    add(withoutQty);
    const words = normalizeFoodText(withoutQty).split(" ").filter(Boolean);
    if (words.length > 1) {
      add(words[words.length - 1]);
      add(words.slice(-2).join(" "));
    }
  }

  return Array.from(tokens).slice(0, 40);
}

export function entryMatchesQuery(
  entry: {
    description: string;
    display_name?: string | null;
    search_aliases?: string[] | null;
  },
  query: string,
): boolean {
  const q = normalizeFoodText(query);
  if (q.length < 2) {
    return false;
  }

  const haystacks = [
    entry.description,
    entry.display_name ?? "",
    ...(entry.search_aliases ?? []),
  ].map(normalizeFoodText);

  return haystacks.some((hay) => hay.includes(q));
}
