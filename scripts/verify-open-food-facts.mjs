/**
 * Unit tests for Open Food Facts helpers. No network.
 * Run: node scripts/verify-open-food-facts.mjs
 *
 * MIRRORS normalizeBarcode / isPlausibleBarcode / scaleNutrients /
 * readNutrients from src/lib/open-food-facts.ts — keep in sync.
 */

const normalizeBarcode = (raw) => raw.replace(/\D/g, "");
const isPlausibleBarcode = (b) => /^\d{8,14}$/.test(b);

function scaleNutrients(base, multiplier) {
  const scale = (v) => (v == null ? null : Math.round(v * multiplier * 10) / 10);
  return {
    calories: base.calories == null ? null : Math.round(base.calories * multiplier),
    proteinG: scale(base.proteinG),
    carbsG: scale(base.carbsG),
    fatG: scale(base.fatG),
    present: { ...base.present },
  };
}

function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readNutrients(nutriments, suffix) {
  const energyKcal =
    toFiniteOrNull(nutriments[`energy-kcal_${suffix}`]) ??
    toFiniteOrNull(nutriments[`energy-kcal`]) ??
    (toFiniteOrNull(nutriments[`energy_${suffix}`]) != null
      ? Math.round(Number(nutriments[`energy_${suffix}`]) / 4.184)
      : null);
  const proteinG = toFiniteOrNull(nutriments[`proteins_${suffix}`]);
  const carbsG = toFiniteOrNull(nutriments[`carbohydrates_${suffix}`]);
  const fatG = toFiniteOrNull(nutriments[`fat_${suffix}`]);
  return {
    calories: energyKcal != null ? Math.round(energyKcal) : null,
    proteinG: proteinG != null ? Math.round(proteinG * 10) / 10 : null,
    carbsG: carbsG != null ? Math.round(carbsG * 10) / 10 : null,
    fatG: fatG != null ? Math.round(fatG * 10) / 10 : null,
    present: {
      calories: energyKcal != null,
      proteinG: proteinG != null,
      carbsG: carbsG != null,
      fatG: fatG != null,
    },
  };
}

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed += 1;
}

// normalizeBarcode
check("strips spaces/dashes", normalizeBarcode("5 000159-484695") === "5000159484695");
check("strips letters", normalizeBarcode("EAN: 5000159484695") === "5000159484695");
check("empty stays empty", normalizeBarcode("abc") === "");

// isPlausibleBarcode
check("EAN-13 plausible", isPlausibleBarcode("5000159484695"));
check("EAN-8 plausible", isPlausibleBarcode("96385074"));
check("UPC-A (12) plausible", isPlausibleBarcode("036000291452"));
check("14 digits plausible", isPlausibleBarcode("12345678901234"));
check("7 digits rejected", !isPlausibleBarcode("1234567"));
check("15 digits rejected", !isPlausibleBarcode("123456789012345"));
check("empty rejected", !isPlausibleBarcode(""));
check("non-digits rejected", !isPlausibleBarcode("5000159a84695"));

// scaleNutrients
{
  const base = { calories: 250, proteinG: 10.5, carbsG: 30, fatG: 8.25, present: { calories: true, proteinG: true, carbsG: true, fatG: true } };
  const x2 = scaleNutrients(base, 2);
  check("scale ×2 calories", x2.calories === 500);
  check("scale ×2 protein", x2.proteinG === 21);
  check("scale ×2 fat rounds to 1dp", x2.fatG === 16.5);
  const half = scaleNutrients(base, 0.5);
  check("scale ×0.5 calories rounds", half.calories === 125);
  check("scale ×0.5 protein", half.proteinG === 5.3, `(got ${half.proteinG})`);
  const grams = scaleNutrients(base, 150 / 100);
  check("150g from per-100g", grams.calories === 375 && grams.carbsG === 45, JSON.stringify(grams));
  check("scale does not mutate base", base.calories === 250 && base.present.calories === true);
}

// Missing values stay null — never invented as zero
{
  const base = { calories: 100, proteinG: null, carbsG: 12, fatG: null, present: { calories: true, proteinG: false, carbsG: true, fatG: false } };
  const s = scaleNutrients(base, 3);
  check("null protein stays null", s.proteinG === null);
  check("null fat stays null", s.fatG === null);
  check("present flags preserved", s.present.proteinG === false && s.present.calories === true);
  check("present values scale", s.calories === 300 && s.carbsG === 36);
  check("zero is a real value (present)", scaleNutrients({ ...base, fatG: 0, present: { ...base.present, fatG: true } }, 2).fatG === 0);
}

// readNutrients mirrors API field handling
{
  const n = readNutrients({ "energy-kcal_100g": 389, proteins_100g: 12.34, carbohydrates_100g: "60", fat_100g: 6.78 }, "100g");
  check("reads kcal/macros", n.calories === 389 && n.proteinG === 12.3 && n.carbsG === 60 && n.fatG === 6.8, JSON.stringify(n));
  check("all present", Object.values(n.present).every(Boolean));
}
{
  const n = readNutrients({ energy_100g: 1674, proteins_100g: 10 }, "100g");
  check("kJ converted to kcal", n.calories === 400, `(got ${n.calories})`);
  check("missing carbs/fat → null + not present", n.carbsG === null && n.fatG === null && !n.present.carbsG && !n.present.fatG);
}
{
  const n = readNutrients({}, "serving");
  check("empty nutriments → all null, none present", n.calories === null && n.proteinG === null && !n.present.calories && !n.present.fatG);
}
{
  const n = readNutrients({ "energy-kcal_100g": 0, fat_100g: 0 }, "100g");
  check("explicit zero is present", n.calories === 0 && n.present.calories && n.fatG === 0 && n.present.fatG);
}
{
  const n = readNutrients({ proteins_100g: "abc", fat_100g: "" }, "100g");
  check("garbage/empty strings → null", n.proteinG === null && n.fatG === null);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll open-food-facts checks passed.");
