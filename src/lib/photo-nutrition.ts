import type { NutritionEstimate } from "@/lib/nutrition";
import { parseFoodEstimationResponse } from "@/lib/nutrition";
import {
  isPlausibleBarcode,
  normalizeBarcode,
  preferredProductNutrients,
  type OpenFoodFactsProduct,
} from "@/lib/open-food-facts";

export type PhotoMacroKey = "calories" | "proteinG" | "carbsG" | "fatG";

export type LabelBasis = "per_serving" | "per_100" | "per_package" | "unknown";

export type PhotoLabelRead = {
  kind: "label";
  estimate: NutritionEstimate;
  description: string;
  notice: string;
  brand: string | null;
  barcode: string | null;
  missing: PhotoMacroKey[];
  basis: LabelBasis;
  servingSize: string | null;
};

export type ParsedPhotoNutrition =
  | { kind: "food"; estimate: NutritionEstimate; description: string }
  | PhotoLabelRead
  | { kind: "barcode"; barcode: string | null; notice: string }
  | { kind: "unreadable"; message: string }
  | { kind: "clarification"; question: string }
  | { kind: "invalid" };

const MACRO_LABEL: Record<PhotoMacroKey, string> = {
  calories: "calories",
  proteinG: "protein",
  carbsG: "carbohydrates",
  fatG: "fat",
};

const UNREADABLE_LABEL =
  "The nutrition label couldn’t be read. Retake the photo in better light, or enter the values manually.";

const UNREADABLE_PHOTO =
  "That photo couldn’t be read. Retake it, or enter the food manually.";

type MacroBlock = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // continue
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim()) as unknown;
    } catch {
      // continue
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
  return null;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function readBlock(value: unknown): MacroBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const unit = (text(row.energy_unit) ?? "").toLowerCase();
  const rawCalories = optionalNumber(row.calories ?? row.energy_kcal);
  const rawKj = optionalNumber(row.energy_kj);
  let calories: number | null = null;
  if (rawKj != null && rawCalories == null) {
    calories = Math.round(rawKj / 4.184);
  } else if (rawCalories != null && (unit === "kj" || unit === "kilojoules" || unit === "kilojoule")) {
    calories = Math.round(rawCalories / 4.184);
  } else if (rawCalories != null) {
    calories = Math.round(rawCalories);
  }

  const block: MacroBlock = {
    calories,
    proteinG: roundMacro(optionalNumber(row.protein_g ?? row.proteinG)),
    carbsG: roundMacro(optionalNumber(row.carbs_g ?? row.carbsG)),
    fatG: roundMacro(optionalNumber(row.fat_g ?? row.fatG)),
  };
  return hasAny(block) ? block : null;
}

function roundMacro(value: number | null): number | null {
  if (value == null) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function hasAny(block: MacroBlock | null): boolean {
  return (
    !!block &&
    (block.calories != null ||
      block.proteinG != null ||
      block.carbsG != null ||
      block.fatG != null)
  );
}

function missingOf(block: MacroBlock): PhotoMacroKey[] {
  const missing: PhotoMacroKey[] = [];
  if (block.calories == null) {
    missing.push("calories");
  }
  if (block.proteinG == null) {
    missing.push("proteinG");
  }
  if (block.carbsG == null) {
    missing.push("carbsG");
  }
  if (block.fatG == null) {
    missing.push("fatG");
  }
  return missing;
}

function asBasis(value: string | null): LabelBasis | null {
  if (
    value === "per_serving" ||
    value === "per_100" ||
    value === "per_package" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function chooseLabel(record: Record<string, unknown>): {
  block: MacroBlock;
  basis: LabelBasis;
  servingSize: string | null;
} | null {
  const servingSize = text(record.serving_size ?? record.servingSize);
  const perServing = readBlock(record.per_serving ?? record.perServing);
  const per100 = readBlock(record.per_100 ?? record.per_100g ?? record.per100);
  const stated = asBasis(text(record.basis));

  if (hasAny(perServing) && hasAny(per100)) {
    if (servingSize) {
      return { block: perServing!, basis: "per_serving", servingSize };
    }
    return { block: per100!, basis: "per_100", servingSize: null };
  }
  if (hasAny(perServing)) {
    return {
      block: perServing!,
      basis: servingSize ? "per_serving" : (stated ?? "unknown"),
      servingSize,
    };
  }
  if (hasAny(per100)) {
    return { block: per100!, basis: "per_100", servingSize };
  }

  const flat = readBlock(record.totals);
  if (!hasAny(flat)) {
    return null;
  }
  const basis: LabelBasis =
    stated && stated !== "unknown"
      ? stated
      : servingSize
        ? "per_serving"
        : "unknown";
  return { block: flat!, basis, servingSize };
}

function productTitle(name: string, brand: string | null): string {
  if (!brand) {
    return name;
  }
  if (name.toLowerCase().includes(brand.toLowerCase())) {
    return name;
  }
  return `${brand} ${name}`;
}

function labelDescription(
  name: string,
  brand: string | null,
  basis: LabelBasis,
  servingSize: string | null,
): string {
  const title = productTitle(name, brand);
  if (basis === "per_serving") {
    return `${title} (${servingSize || "1 serving"})`;
  }
  if (basis === "per_100") {
    return `${title} (100 g)`;
  }
  if (basis === "per_package") {
    return `${title} (${servingSize || "1 pack"})`;
  }
  return title;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function labelNotice(input: {
  basis: LabelBasis;
  servingSize: string | null;
  missing: PhotoMacroKey[];
  nameMissing: boolean;
  fibreG: number | null;
  saturatedFatG: number | null;
}): string {
  const parts: string[] = ["Read from the nutrition label."];
  if (input.basis === "per_serving") {
    parts.push(
      input.servingSize
        ? `One serving is ${input.servingSize}. Change the quantity if you ate a different amount.`
        : "Confirm the serving size before logging.",
    );
  } else if (input.basis === "per_100") {
    parts.push("These values are per 100 g. Confirm how much you ate.");
  } else if (input.basis === "per_package") {
    parts.push(
      input.servingSize
        ? `These values are for the pack (${input.servingSize}). Confirm how much you ate.`
        : "These values are for the whole pack. Confirm how much you ate.",
    );
  } else {
    parts.push("The serving size isn’t clear. Confirm how much you ate.");
  }
  if (input.nameMissing) {
    parts.push("The product name wasn’t readable.");
  }
  if (input.missing.length > 0) {
    const names = input.missing.map((key) => MACRO_LABEL[key]);
    parts.push(
      `Add the missing ${names.join(", ")}. The values that could be read are kept, and nothing was guessed.`,
    );
  }
  const extras: string[] = [];
  if (input.fibreG != null) {
    extras.push(`fibre ${formatAmount(input.fibreG)} g`);
  }
  if (input.saturatedFatG != null) {
    extras.push(`saturated fat ${formatAmount(input.saturatedFatG)} g`);
  }
  if (extras.length > 0) {
    parts.push(
      `The label also shows ${extras.join(" and ")}. The diary stores calories, protein, carbohydrates and fat.`,
    );
  }
  return parts.join(" ");
}

function toEstimate(
  block: MacroBlock,
  displayName: string,
  source: NutritionEstimate["source"],
  missing: PhotoMacroKey[],
): NutritionEstimate {
  return {
    calories: block.calories ?? 0,
    proteinG: block.proteinG ?? 0,
    carbsG: block.carbsG ?? 0,
    fatG: block.fatG ?? 0,
    confidence: missing.length > 0 ? "medium" : "high",
    source,
    displayName,
    searchAliases: [],
    items: [],
  };
}

function readBarcode(value: unknown): string | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  const digits = normalizeBarcode(raw);
  return isPlausibleBarcode(digits) ? digits : null;
}

function buildLabel(
  record: Record<string, unknown>,
  chosen: { block: MacroBlock; basis: LabelBasis; servingSize: string | null },
  source: NutritionEstimate["source"],
): PhotoLabelRead {
  const brand = text(record.brand);
  const explicitName = text(record.product_name ?? record.display_name ?? record.name);
  const name = explicitName ?? "Packaged food";
  const missing = missingOf(chosen.block);
  const fibreG = optionalNumber(record.fibre_g ?? record.fiber_g);
  const saturatedFatG = optionalNumber(record.saturated_fat_g);
  return {
    kind: "label",
    estimate: toEstimate(chosen.block, explicitName ?? name, source, missing),
    description: labelDescription(name, brand, chosen.basis, chosen.servingSize),
    notice: labelNotice({
      basis: chosen.basis,
      servingSize: chosen.servingSize,
      missing,
      nameMissing: !explicitName,
      fibreG,
      saturatedFatG,
    }),
    brand,
    barcode: readBarcode(record.barcode),
    missing,
    basis: chosen.basis,
    servingSize: chosen.servingSize,
  };
}

function foodDescription(estimate: NutritionEstimate): string {
  if (estimate.displayName?.trim()) {
    return estimate.displayName.trim();
  }
  if (estimate.items.length > 0) {
    return estimate.items.map((item) => item.description).join(", ");
  }
  return "Meal from photo";
}

/**
 * Turn a photo-model response into label numbers, a food estimate, or a
 * clear failure. Printed label values are never replaced with estimates.
 */
export function parsePhotoNutritionResponse(raw: string): ParsedPhotoNutrition {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "invalid" };
  }
  const record = parsed as Record<string, unknown>;
  const imageKind = text(record.image_kind)?.toLowerCase() ?? "";

  if (imageKind === "unreadable") {
    return {
      kind: "unreadable",
      message: text(record.message) ?? text(record.question) ?? UNREADABLE_PHOTO,
    };
  }

  if (imageKind === "barcode" || imageKind === "qr") {
    const barcode = readBarcode(record.barcode);
    return {
      kind: "barcode",
      barcode,
      notice:
        text(record.message) ??
        (barcode
          ? "A product code was read from the photo."
          : "That code doesn’t identify a packaged food. Photograph the nutrition label or enter the food manually."),
    };
  }

  const labelKinds = imageKind === "nutrition_label" || imageKind === "mixed";
  if (labelKinds || record.per_serving || record.per_100 || record.per_100g) {
    const chosen = chooseLabel(record);
    if (chosen) {
      return buildLabel(record, chosen, "user");
    }
    if (labelKinds) {
      return {
        kind: "unreadable",
        message: text(record.message) ?? UNREADABLE_LABEL,
      };
    }
  }

  if (record.needs_clarification === true) {
    const question = text(record.question);
    if (!question) {
      return { kind: "invalid" };
    }
    return { kind: "clarification", question };
  }

  const food = parseFoodEstimationResponse(raw);
  if (food.kind === "estimate") {
    return {
      kind: "food",
      estimate: food.estimate,
      description: foodDescription(food.estimate),
    };
  }
  if (food.kind === "clarification") {
    return food;
  }
  return { kind: "invalid" };
}

/** One serving (or 100 g) from an Open Food Facts product, for the review screen. */
export function reviewFromProduct(product: OpenFoodFactsProduct): PhotoLabelRead | null {
  const preferred = preferredProductNutrients(product);
  if (!preferred) {
    return null;
  }
  const { nutrients, basis } = preferred;
  const block: MacroBlock = {
    calories: nutrients.present.calories ? nutrients.calories : null,
    proteinG: nutrients.present.proteinG ? nutrients.proteinG : null,
    carbsG: nutrients.present.carbsG ? nutrients.carbsG : null,
    fatG: nutrients.present.fatG ? nutrients.fatG : null,
  };
  const missing = missingOf(block);
  const servingSize =
    basis === "serving"
      ? product.servingSizeLabel
      : "100 g";
  const labelBasis: LabelBasis = basis === "serving" ? "per_serving" : "per_100";
  const name = product.name.trim() || "Packaged food";
  const description = labelDescription(name, product.brand, labelBasis, servingSize);
  const gap =
    missing.length > 0
      ? ` Add the missing ${missing.map((key) => MACRO_LABEL[key]).join(", ")}. Nothing was guessed.`
      : "";
  const notice =
    basis === "serving"
      ? `Found this product from the barcode. One serving is ${servingSize || "the labelled serving"}. Check it before logging.${gap}`
      : `Found this product from the barcode. These values are per 100 g. Confirm how much you ate.${gap}`;

  return {
    kind: "label",
    estimate: toEstimate(block, name, "open_food_facts", missing),
    description,
    notice,
    brand: product.brand,
    barcode: product.barcode,
    missing,
    basis: labelBasis,
    servingSize,
  };
}
