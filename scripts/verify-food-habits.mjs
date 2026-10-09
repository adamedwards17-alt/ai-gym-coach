/**
 * Tests for recurring-food habit detection.
 * Run: node scripts/verify-food-habits.mjs
 *
 * MIRRORS src/lib/food-habits.ts (and normalizeFoodText from
 * src/lib/food-naming.ts) — keep in sync.
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

const DEFAULT_HABIT_CONFIG = {
  lookbackDays: 7,
  minDays: 4,
  hourWindow: 2,
  negligibleCalorieCeiling: 15,
};

const hourFromCreatedAt = (createdAt) => {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : date.getHours();
};
const habitKey = (label, hour) => `${normalizeFoodText(label)}@${hour}`;
const canonicalLabel = (entry) =>
  entry.display_name?.trim() || entry.description.trim().slice(0, 48);

function detectFoodHabits(input) {
  const config = { ...DEFAULT_HABIT_CONFIG, ...input.config };
  const stopped = new Set(input.stoppedKeys ?? []);
  const prompted = new Set(input.promptedTodayKeys ?? []);
  const loggedToday = new Set((input.loggedTodayLabels ?? []).map(normalizeFoodText));
  const buckets = new Map();

  for (const entry of input.entries) {
    if (entry.logged_date >= input.localDate) continue;
    const hour = hourFromCreatedAt(entry.created_at);
    if (hour == null) continue;
    const label = canonicalLabel(entry);
    const norm = normalizeFoodText(label);
    if (norm.length < 2) continue;
    const hourBucket = Math.round(hour / config.hourWindow) * config.hourWindow;
    const mapKey = `${norm}|${hourBucket}`;
    const existing = buckets.get(mapKey);
    if (!existing) {
      buckets.set(mapKey, {
        label,
        description: entry.description,
        mealType: entry.meal_type,
        hours: [hour],
        days: new Set([entry.logged_date]),
        calories: [entry.calories_estimated == null ? -1 : entry.calories_estimated],
        sample: entry,
      });
    } else {
      existing.hours.push(hour);
      existing.days.add(entry.logged_date);
      existing.calories.push(entry.calories_estimated == null ? -1 : entry.calories_estimated);
      if (existing.sample.calories_estimated == null && entry.calories_estimated != null) {
        existing.sample = entry;
        existing.description = entry.description;
      }
    }
  }

  const currentHour = input.now.getHours();
  const habits = [];
  for (const bucket of buckets.values()) {
    if (bucket.days.size < config.minDays) continue;
    const typicalHour = Math.round(bucket.hours.reduce((a, b) => a + b, 0) / bucket.hours.length);
    if (Math.abs(currentHour - typicalHour) > config.hourWindow) continue;

    const known = bucket.calories.filter((c) => c >= 0);
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    const negligible = avg != null && avg <= config.negligibleCalorieCeiling;

    const key = habitKey(bucket.label, typicalHour);
    if (stopped.has(key) || prompted.has(key)) continue;
    if (loggedToday.has(normalizeFoodText(bucket.label))) continue;
    const aliases = [bucket.label, bucket.description, ...(bucket.sample.search_aliases ?? [])].map(normalizeFoodText);
    if (aliases.some((a) => loggedToday.has(a))) continue;

    habits.push({
      key,
      label: bucket.label,
      description: bucket.description,
      mealType: bucket.mealType,
      typicalHour,
      daysObserved: bucket.days.size,
      negligibleCalories: negligible,
      sampleCalories: bucket.sample.calories_estimated,
      sampleProteinG: bucket.sample.protein_g_estimated ?? null,
      sampleCarbsG: bucket.sample.carbs_g_estimated ?? null,
      sampleFatG: bucket.sample.fat_g_estimated ?? null,
    });
  }

  habits.sort((a, b) => {
    if (a.negligibleCalories !== b.negligibleCalories) return a.negligibleCalories ? 1 : -1;
    return b.daysObserved - a.daysObserved;
  });
  return habits;
}

const habitPromptTitle = (h) => `Did you have your usual ${h.label.toLowerCase()} today?`;

// --- Fixtures -----------------------------------------------------------------
const TODAY = "2026-10-09";
const now = new Date(2026, 9, 9, 8, 15);

function entry(daysAgo, hour, fields = {}) {
  const d = new Date(2026, 9, 9 - daysAgo, hour, 5);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    logged_date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    description: "Latte with oat milk",
    display_name: "Latte",
    search_aliases: ["latte", "oat milk latte"],
    meal_type: "drink",
    calories_estimated: 120,
    protein_g_estimated: 4,
    carbs_g_estimated: 14,
    fat_g_estimated: 5,
    created_at: d.toISOString(),
    ...fields,
  };
}
const daily = (fields, hour = 8, days = [1, 2, 3, 4, 5]) => days.map((d) => entry(d, hour, fields));

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed += 1;
}

// Detection
{
  const habits = detectFoodHabits({ entries: daily(), localDate: TODAY, now });
  check("detects a 5-day habit", habits.length === 1, `(got ${habits.length})`);
  const h = habits[0];
  check("habit label from display_name", h?.label === "Latte");
  check("habit has stable key", h?.key === "latte@8", `(got ${h?.key})`);
  check("habit counts days", h?.daysObserved === 5);
  check("non-negligible calories", h?.negligibleCalories === false);
  check("sample calories from sample entry", h?.sampleCalories === 120);
  check("sample protein from sample entry (not null)", h?.sampleProteinG === 4, `(got ${h?.sampleProteinG})`);
  check("sample carbs from sample entry (not null)", h?.sampleCarbsG === 14, `(got ${h?.sampleCarbsG})`);
  check("sample fat from sample entry (not null)", h?.sampleFatG === 5, `(got ${h?.sampleFatG})`);
  check("prompt title", habitPromptTitle(h) === "Did you have your usual latte today?");
}
{
  const entries = daily({ calories_estimated: null, protein_g_estimated: null, carbs_g_estimated: null, fat_g_estimated: null });
  entries.push(entry(6, 8, { calories_estimated: 150, protein_g_estimated: 6, carbs_g_estimated: 16, fat_g_estimated: 7 }));
  const h = detectFoodHabits({ entries, localDate: TODAY, now })[0];
  check("sample upgrades to entry with macros", h?.sampleProteinG === 6 && h?.sampleCarbsG === 16 && h?.sampleFatG === 7, JSON.stringify(h));
}
{
  const entries = daily({ protein_g_estimated: undefined, carbs_g_estimated: undefined, fat_g_estimated: undefined });
  const h = detectFoodHabits({ entries, localDate: TODAY, now })[0];
  check("missing macro fields → null (never invented)", h?.sampleProteinG === null && h?.sampleCarbsG === null && h?.sampleFatG === null);
}

// Thresholds
check("3 days is not a habit", detectFoodHabits({ entries: daily({}, 8, [1, 2, 3]), localDate: TODAY, now }).length === 0);
check("exactly 4 days is a habit", detectFoodHabits({ entries: daily({}, 8, [1, 2, 3, 4]), localDate: TODAY, now }).length === 1);
check("same-day repeats count once", detectFoodHabits({ entries: [entry(1, 8), entry(1, 8), entry(1, 8), entry(2, 8), entry(2, 8)], localDate: TODAY, now }).length === 0);
check("today's entries are excluded from history", detectFoodHabits({ entries: [...daily({}, 8, [1, 2, 3]), entry(0, 8)], localDate: TODAY, now }).length === 0);

// Time window
check("not prompted outside the hour window", detectFoodHabits({ entries: daily({}, 8), localDate: TODAY, now: new Date(2026, 9, 9, 15, 0) }).length === 0);
check("prompted at edge of hour window", detectFoodHabits({ entries: daily({}, 8), localDate: TODAY, now: new Date(2026, 9, 9, 10, 0) }).length === 1);

// Suppression
check("stopped habit suppressed", detectFoodHabits({ entries: daily(), localDate: TODAY, now, stoppedKeys: ["latte@8"] }).length === 0);
check("prompted-today suppressed", detectFoodHabits({ entries: daily(), localDate: TODAY, now, promptedTodayKeys: ["latte@8"] }).length === 0);
check("already logged today (label) suppressed", detectFoodHabits({ entries: daily(), localDate: TODAY, now, loggedTodayLabels: ["Latte"] }).length === 0);
check("already logged today (alias) suppressed", detectFoodHabits({ entries: daily(), localDate: TODAY, now, loggedTodayLabels: ["oat milk latte"] }).length === 0);

// Negligible + ordering
{
  const black = daily({ description: "Black coffee", display_name: "Coffee", calories_estimated: 2, search_aliases: [] });
  const habits = detectFoodHabits({ entries: [...black, ...daily()], localDate: TODAY, now });
  check("negligible habit flagged", habits.find((h) => h.label === "Coffee")?.negligibleCalories === true);
  check("non-negligible sorted before negligible", habits[0]?.label === "Latte", `(got ${habits[0]?.label})`);
}

// Fallback label when no display_name
{
  const h = detectFoodHabits({ entries: daily({ display_name: null, description: "Greek yoghurt and berries" }), localDate: TODAY, now })[0];
  check("falls back to description for label", h?.label === "Greek yoghurt and berries");
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll food-habits checks passed.");
