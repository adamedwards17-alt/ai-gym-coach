/**
 * Tests for food display names + aliases.
 * Run: node scripts/verify-food-naming.mjs
 *
 * MIRRORS src/lib/food-naming.ts — keep in sync.
 */

function normalizeFoodText(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function deriveDisplayName(description, suggested) {
  const suggestion = suggested?.trim();
  if (suggestion && suggestion.length >= 2 && suggestion.length <= 48) {
    return suggestion;
  }
  const trimmed = description.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Food";
  const lower = trimmed.toLowerCase();

  if (
    /\beggs?\b/.test(lower) &&
    (/\bspinach\b|\bmushroom|\bpepper|\btomato|\bonion|\bcoconut oil\b/.test(lower) ||
      /\begg whites?\b/.test(lower))
  ) {
    return /\bscrambl/.test(lower) ? "Scrambled eggs" : "Omelette";
  }
  if (/\bcappuccino\b/.test(lower)) return "Cappuccino";
  if (/\blatte\b/.test(lower)) return "Latte";
  if (/\b(black )?coffee\b/.test(lower) || /\bespresso\b/.test(lower)) return "Coffee";
  if (/\bprotein bar\b/.test(lower)) return "Protein bar";

  if (trimmed.length <= 36 && !/,/.test(trimmed) && trimmed.split(" ").length <= 5) {
    return titleCase(trimmed);
  }
  const firstClause = trimmed.split(/,| with /i)[0]?.trim() ?? trimmed;
  if (firstClause.length > 0 && firstClause.length <= 40) return titleCase(firstClause);
  return titleCase(trimmed.slice(0, 40).trim());
}

function buildSearchAliases({ displayName, description, brand, extra }) {
  const tokens = new Set();
  const add = (value) => {
    const n = normalizeFoodText(value ?? "");
    if (n.length >= 2) tokens.add(n);
  };
  add(displayName);
  add(description);
  add(brand ?? null);
  for (const e of extra ?? []) add(e);

  const parts = description
    .split(/,| and | with |\+|\/|&/i)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    add(part);
    const withoutQty = part.replace(/^\d+(\.\d+)?\s*(x|×)?\s*/i, "");
    add(withoutQty);
    const words = normalizeFoodText(withoutQty).split(" ").filter(Boolean);
    if (words.length > 1) {
      add(words[words.length - 1]);
      add(words.slice(-2).join(" "));
    }
  }
  return Array.from(tokens).slice(0, 40);
}

function entryMatchesQuery(entry, query) {
  const q = normalizeFoodText(query);
  if (q.length < 2) return false;
  const hay = [entry.description, entry.display_name ?? "", ...(entry.search_aliases ?? [])].map(normalizeFoodText);
  return hay.some((h) => h.includes(q));
}

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed += 1;
}
const eq = (name, got, expected) =>
  check(name, got === expected, `(got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)})`);

// normalizeFoodText
eq("normalize strips accents/punctuation", normalizeFoodText("  Crème   Brûlée! "), "creme brulee");
eq("normalize lowercases", normalizeFoodText("EGGS & Toast"), "eggs toast");

// deriveDisplayName
eq("model suggestion wins", deriveDisplayName("2 eggs, spinach, mushrooms", "Veggie omelette"), "Veggie omelette");
eq("ignores over-long suggestion", deriveDisplayName("black coffee", "x".repeat(60)), "Coffee");
eq("ingredient list → Omelette", deriveDisplayName("3 eggs, spinach, mushrooms, coconut oil"), "Omelette");
eq("scrambled variant", deriveDisplayName("3 scrambled eggs with spinach"), "Scrambled eggs");
eq("cappuccino", deriveDisplayName("a large cappuccino with semi-skimmed milk"), "Cappuccino");
eq("latte", deriveDisplayName("oat milk latte"), "Latte");
eq("black coffee → Coffee", deriveDisplayName("black coffee"), "Coffee");
eq("protein bar", deriveDisplayName("Barebells protein bar"), "Protein bar");
eq("short name title-cased", deriveDisplayName("greek yoghurt"), "Greek Yoghurt");
eq("first clause for long lists", deriveDisplayName("chicken breast with rice and broccoli, olive oil, soy sauce, extra stuff"), "Chicken Breast");
eq("empty → Food", deriveDisplayName("   "), "Food");

// buildSearchAliases
{
  const aliases = buildSearchAliases({
    displayName: "Omelette",
    description: "3 large eggs, spinach, mushrooms",
    brand: "Acme",
  });
  check("aliases include display name", aliases.includes("omelette"));
  check("aliases include brand", aliases.includes("acme"));
  check("aliases include ingredient", aliases.includes("spinach") && aliases.includes("mushrooms"));
  check("aliases drop leading quantity", aliases.includes("large eggs"), JSON.stringify(aliases));
  check("aliases include last word", aliases.includes("eggs"));
  check("aliases are unique", new Set(aliases).size === aliases.length);
  check("aliases capped at 40", buildSearchAliases({ displayName: "x", description: Array.from({ length: 80 }, (_, i) => `food${i}`).join(", ") }).length <= 40);
  check("aliases include model extras", buildSearchAliases({ displayName: "Omelette", description: "eggs", extra: ["breakfast scramble"] }).includes("breakfast scramble"));
}

// entryMatchesQuery
{
  const entry = {
    description: "3 large eggs, spinach, mushrooms",
    display_name: "Omelette",
    search_aliases: ["omelette", "eggs", "spinach"],
  };
  check("matches display name", entryMatchesQuery(entry, "omel"));
  check("matches description", entryMatchesQuery(entry, "mushroom"));
  check("matches alias only", entryMatchesQuery({ ...entry, description: "x food" }, "spinach"));
  check("case/accents insensitive", entryMatchesQuery(entry, "OMELETTE"));
  check("no match", !entryMatchesQuery(entry, "salmon"));
  check("query under 2 chars never matches", !entryMatchesQuery(entry, "o"));
  check("handles null aliases/name", entryMatchesQuery({ description: "Chicken wrap", display_name: null, search_aliases: null }, "wrap"));
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll food-naming checks passed.");
