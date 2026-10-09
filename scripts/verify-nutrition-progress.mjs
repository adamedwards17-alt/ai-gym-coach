/**
 * Tests for nutrition progress bar logic.
 * Run: node scripts/verify-nutrition-progress.mjs
 *
 * MIRRORS src/lib/nutrition-progress.ts — keep in sync.
 */

function fillPercent(consumed, target) {
  return target <= 0 ? 0 : Math.round((consumed / target) * 100);
}

function proteinPaceBehind({ now, consumedProteinG, targetProteinG }) {
  if (targetProteinG <= 0) return false;
  const hour = now.getHours() + now.getMinutes() / 60;
  const wake = 6;
  const sleep = 22;
  if (hour < 11) return false;
  if (hour < 14) return false;
  const elapsed = Math.min(Math.max(hour - wake, 0), sleep - wake);
  const expected = targetProteinG * (elapsed / (sleep - wake));
  return consumedProteinG < expected * 0.7 && expected - consumedProteinG >= 25;
}

function buildMacroProgress({ summary, now = new Date() }) {
  if (summary.targetsStatus !== "ok" || !summary.targets) return null;
  const { targets, consumed, remaining } = summary;
  const proteinBehind = proteinPaceBehind({
    now,
    consumedProteinG: consumed.proteinG,
    targetProteinG: targets.protein_g,
  });
  return [
    {
      id: "calories",
      fillPercent: fillPercent(consumed.calories, targets.daily_calories),
      tone: remaining.calories < 0 ? "over" : "normal",
      statusLabel:
        remaining.calories < 0
          ? `${Math.abs(remaining.calories).toLocaleString()} kcal over`
          : `${remaining.calories.toLocaleString()} kcal remaining`,
    },
    {
      id: "protein",
      fillPercent: fillPercent(consumed.proteinG, targets.protein_g),
      tone: remaining.proteinG < 0 ? "over" : proteinBehind ? "behind" : "normal",
      statusLabel:
        remaining.proteinG < 0
          ? `${Math.abs(remaining.proteinG)}g over`
          : proteinBehind
            ? "Behind pace for this time of day"
            : null,
    },
    {
      id: "carbs",
      fillPercent: fillPercent(consumed.carbsG, targets.carbs_g),
      tone: remaining.carbsG < 0 ? "over" : "normal",
      statusLabel: remaining.carbsG < 0 ? `${Math.abs(remaining.carbsG)}g over` : null,
    },
    {
      id: "fat",
      fillPercent: fillPercent(consumed.fatG, targets.fat_g),
      tone: remaining.fatG < 0 ? "over" : "normal",
      statusLabel: remaining.fatG < 0 ? `${Math.abs(remaining.fatG)}g over` : null,
    },
  ];
}

function summary(consumed, targets = { daily_calories: 2400, protein_g: 170, carbs_g: 250, fat_g: 70 }, status = "ok") {
  return {
    targetsStatus: status,
    targets: status === "ok" ? targets : null,
    consumed,
    remaining: {
      calories: targets.daily_calories - consumed.calories,
      proteinG: targets.protein_g - consumed.proteinG,
      carbsG: targets.carbs_g - consumed.carbsG,
      fatG: targets.fat_g - consumed.fatG,
    },
  };
}
const at = (h, m = 0) => new Date(2026, 9, 9, h, m);
const byId = (rows, id) => rows.find((r) => r.id === id);

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed += 1;
}

// Null when targets unavailable
for (const status of ["incomplete", "review", "missing"]) {
  check(`no progress when targets ${status}`, buildMacroProgress({ summary: summary({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }, undefined, status), now: at(12) }) === null);
}

// Normal day
{
  const rows = buildMacroProgress({ summary: summary({ calories: 1200, proteinG: 90, carbsG: 120, fatG: 35 }), now: at(15) });
  check("returns four macro rows", rows?.length === 4);
  check("calories 50% fill", byId(rows, "calories").fillPercent === 50);
  check("calories normal tone", byId(rows, "calories").tone === "normal");
  check("calories status text always present", byId(rows, "calories").statusLabel === "1,200 kcal remaining", byId(rows, "calories").statusLabel);
  check("protein on pace at 15:00 → normal", byId(rows, "protein").tone === "normal");
}

// Over
{
  const rows = buildMacroProgress({ summary: summary({ calories: 2600, proteinG: 180, carbsG: 260, fatG: 80 }), now: at(20) });
  for (const id of ["calories", "protein", "carbs", "fat"]) {
    check(`${id} over → tone over with text`, byId(rows, id).tone === "over" && /over$/.test(byId(rows, id).statusLabel ?? ""), JSON.stringify(byId(rows, id)));
  }
  check("fill percent can exceed 100", byId(rows, "calories").fillPercent === 108);
  check("calories over label", byId(rows, "calories").statusLabel === "200 kcal over");
}

// Exactly on target is not over
{
  const rows = buildMacroProgress({ summary: summary({ calories: 2400, proteinG: 170, carbsG: 250, fatG: 70 }), now: at(21) });
  check("exactly at target → not over", rows.every((r) => r.tone !== "over"));
}

// Protein pace
check("morning never flags protein behind", !proteinPaceBehind({ now: at(10, 30), consumedProteinG: 0, targetProteinG: 170 }));
check("before 14:00 never flags protein behind", !proteinPaceBehind({ now: at(13, 59), consumedProteinG: 0, targetProteinG: 170 }));
check("15:00 with 20g → behind", proteinPaceBehind({ now: at(15), consumedProteinG: 20, targetProteinG: 170 }));
check("15:00 with 80g → not behind", !proteinPaceBehind({ now: at(15), consumedProteinG: 80, targetProteinG: 170 }));
check("zero target never behind", !proteinPaceBehind({ now: at(18), consumedProteinG: 0, targetProteinG: 0 }));
{
  const rows = buildMacroProgress({ summary: summary({ calories: 500, proteinG: 20, carbsG: 50, fatG: 15 }), now: at(18) });
  check("behind protein has tone + text", byId(rows, "protein").tone === "behind" && !!byId(rows, "protein").statusLabel);
}
{
  const rows = buildMacroProgress({ summary: summary({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }), now: at(9) });
  check("empty morning → all normal, 0% fill", rows.every((r) => r.tone === "normal" && r.fillPercent === 0));
}

// Zero target guard
check("fillPercent guards zero target", fillPercent(50, 0) === 0);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll nutrition-progress checks passed.");
