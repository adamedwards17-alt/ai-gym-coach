/**
 * Open Food Facts product lookup helpers.
 * Attribution: https://world.openfoodfacts.org
 * API terms require a meaningful User-Agent identifying the app.
 */

export type OpenFoodFactsNutrients = {
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  /** Which fields were present in the source data. */
  present: {
    calories: boolean;
    proteinG: boolean;
    carbsG: boolean;
    fatG: boolean;
  };
};

export type OpenFoodFactsProduct = {
  barcode: string;
  name: string;
  brand: string | null;
  quantityLabel: string | null;
  servingSizeLabel: string | null;
  /** Nutrition per 100g when available. */
  per100g: OpenFoodFactsNutrients;
  /** Nutrition per serving when available. */
  perServing: OpenFoodFactsNutrients | null;
  servingQuantityG: number | null;
  imageUrl: string | null;
  incomplete: boolean;
};

export type LookupBarcodeResult =
  | { status: "ok"; product: OpenFoodFactsProduct }
  | { status: "not_found" }
  | { status: "error"; message: string };

const OFF_USER_AGENT =
  "AIGymCoach/0.1 (nutrition coach; https://github.com/adamedwards17-alt/ai-gym-coach)";

function toFiniteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function readNutrients(
  nutriments: Record<string, unknown>,
  suffix: "100g" | "serving",
): OpenFoodFactsNutrients {
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

function isComplete(n: OpenFoodFactsNutrients): boolean {
  return (
    n.present.calories &&
    n.present.proteinG &&
    n.present.carbsG &&
    n.present.fatG
  );
}

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isPlausibleBarcode(barcode: string): boolean {
  return /^\d{8,14}$/.test(barcode);
}

/**
 * Server-side lookup so we can set User-Agent and avoid browser CORS issues.
 */
export async function fetchOpenFoodFactsProduct(
  barcodeRaw: string,
): Promise<LookupBarcodeResult> {
  const barcode = normalizeBarcode(barcodeRaw);
  if (!isPlausibleBarcode(barcode)) {
    return {
      status: "error",
      message: "Enter a valid barcode (8–14 digits).",
    };
  }

  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: {
          "User-Agent": OFF_USER_AGENT,
          Accept: "application/json",
        },
        next: { revalidate: 0 },
      },
    );

    if (!response.ok) {
      console.error("[open-food-facts] HTTP", response.status);
      return {
        status: "error",
        message: "Product lookup failed. Try again or enter the food manually.",
      };
    }

    const json = (await response.json()) as {
      status?: number;
      product?: Record<string, unknown>;
    };

    if (json.status !== 1 || !json.product) {
      return { status: "not_found" };
    }

    const product = json.product;
    const nutriments =
      product.nutriments &&
      typeof product.nutriments === "object" &&
      !Array.isArray(product.nutriments)
        ? (product.nutriments as Record<string, unknown>)
        : {};

    const nameCandidates = [
      product.product_name,
      product.product_name_en,
      product.generic_name,
    ];
    const name =
      nameCandidates
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .find((v) => v.length > 0) ?? `Product ${barcode}`;

    const brand =
      typeof product.brands === "string" && product.brands.trim()
        ? product.brands.split(",")[0]?.trim() || null
        : null;

    const per100g = readNutrients(nutriments, "100g");
    const perServingRaw = readNutrients(nutriments, "serving");
    const hasServing =
      perServingRaw.present.calories ||
      perServingRaw.present.proteinG ||
      perServingRaw.present.carbsG ||
      perServingRaw.present.fatG;

    const servingQuantityG = toFiniteOrNull(product.serving_quantity);
    const servingSizeLabel =
      typeof product.serving_size === "string" && product.serving_size.trim()
        ? product.serving_size.trim()
        : null;
    const quantityLabel =
      typeof product.quantity === "string" && product.quantity.trim()
        ? product.quantity.trim()
        : null;

    const incomplete = !(
      isComplete(per100g) ||
      (hasServing && isComplete(perServingRaw))
    );

    return {
      status: "ok",
      product: {
        barcode,
        name,
        brand,
        quantityLabel,
        servingSizeLabel,
        per100g,
        perServing: hasServing ? perServingRaw : null,
        servingQuantityG,
        imageUrl:
          typeof product.image_front_small_url === "string"
            ? product.image_front_small_url
            : typeof product.image_url === "string"
              ? product.image_url
              : null,
        incomplete,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown barcode lookup error";
    console.error("[open-food-facts]", message);
    return {
      status: "error",
      message:
        "Couldn’t reach Open Food Facts. Check your connection or enter the food manually.",
    };
  }
}

export function scaleNutrients(
  base: OpenFoodFactsNutrients,
  multiplier: number,
): OpenFoodFactsNutrients {
  const scale = (value: number | null): number | null =>
    value == null ? null : Math.round(value * multiplier * 10) / 10;

  return {
    calories:
      base.calories == null ? null : Math.round(base.calories * multiplier),
    proteinG: scale(base.proteinG),
    carbsG: scale(base.carbsG),
    fatG: scale(base.fatG),
    present: { ...base.present },
  };
}
