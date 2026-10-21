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
  // Only use suffix-scoped fields. Bare `energy-kcal` is often a package or
  // serving total and must not be treated as per-100g then scaled again.
  const energyKcal =
    toFiniteOrNull(nutriments[`energy-kcal_${suffix}`]) ??
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

const UNSUPPORTED_SCAN_MESSAGE =
  "That QR code doesn’t identify a packaged food. Scan the product barcode, photograph the nutrition label, or enter the food manually.";

/**
 * A camera read is only a product barcode when the text is the digits
 * themselves, or a product URL that contains a GTIN. Other QR payloads
 * (a brand website, a menu link) are not treated as a match.
 */
export function interpretScannedCode(
  raw: string,
):
  | { kind: "barcode"; barcode: string }
  | { kind: "unsupported"; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      kind: "unsupported",
      message:
        "No code was read. Try again, enter the barcode, or photograph the nutrition label.",
    };
  }

  if (/^[\d\s-]+$/.test(trimmed)) {
    const digits = normalizeBarcode(trimmed);
    if (isPlausibleBarcode(digits)) {
      return { kind: "barcode", barcode: digits };
    }
    return {
      kind: "unsupported",
      message: "Enter a valid barcode (8–14 digits).",
    };
  }

  const labeled = trimmed.match(
    /(?:\b(?:ean|upc|gtin|barcode)\b)\s*[:#-]?\s*(\d{8}|\d{12,14})\b/i,
  );
  if (labeled?.[1] && isPlausibleBarcode(labeled[1])) {
    return { kind: "barcode", barcode: labeled[1] };
  }

  const fromUrl = barcodeFromProductUrl(trimmed);
  if (fromUrl) {
    return { kind: "barcode", barcode: fromUrl };
  }

  return { kind: "unsupported", message: UNSUPPORTED_SCAN_MESSAGE };
}

function barcodeFromProductUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const gs1 = url.pathname.match(/\/01\/(\d{8}|\d{12,14})(?:\/|$)/);
  if (gs1?.[1]) {
    return gs1[1];
  }

  const product = url.pathname.match(/\/product\/(\d{8}|\d{12,14})(?:\/|$)/);
  if (product?.[1]) {
    return product[1];
  }

  for (const key of ["barcode", "code", "ean", "gtin", "upc"]) {
    const query = url.searchParams.get(key);
    const digits = query ? normalizeBarcode(query) : "";
    if (/^(?:\d{8}|\d{12,14})$/.test(digits)) {
      return digits;
    }
  }

  const segments = url.pathname.split("/").filter(Boolean);
  for (const segment of segments) {
    if (/^(?:\d{8}|\d{12,14})$/.test(segment)) {
      return segment;
    }
  }

  return null;
}

/**
 * Nutrients for one labelled serving when the product has them, otherwise
 * per 100 g. Missing fields stay missing — they are not filled from guesses.
 */
export function preferredProductNutrients(product: OpenFoodFactsProduct): {
  nutrients: OpenFoodFactsNutrients;
  basis: "serving" | "100g";
} | null {
  const derived =
    product.servingQuantityG && hasAnyNutrition(product.per100g)
      ? scaleNutrients(product.per100g, product.servingQuantityG / 100)
      : null;
  const direct = hasAnyNutrition(product.perServing) ? product.perServing : null;

  if (!direct && !derived) {
    return hasAnyNutrition(product.per100g)
      ? { nutrients: product.per100g, basis: "100g" }
      : null;
  }

  const chosen = !direct ? derived : !derived ? direct : mergeNutrients(direct, derived);
  if (!chosen || !hasAnyNutrition(chosen)) {
    return null;
  }
  return { nutrients: chosen, basis: "serving" };
}

function hasAnyNutrition(nutrients: OpenFoodFactsNutrients | null): boolean {
  return (
    !!nutrients &&
    (nutrients.present.calories ||
      nutrients.present.proteinG ||
      nutrients.present.carbsG ||
      nutrients.present.fatG)
  );
}

function mergeNutrients(
  direct: OpenFoodFactsNutrients,
  derived: OpenFoodFactsNutrients,
): OpenFoodFactsNutrients {
  const pick = (
    key: "calories" | "proteinG" | "carbsG" | "fatG",
  ): number | null =>
    direct.present[key]
      ? direct[key]
      : derived.present[key]
        ? derived[key]
        : null;

  return {
    calories: pick("calories"),
    proteinG: pick("proteinG"),
    carbsG: pick("carbsG"),
    fatG: pick("fatG"),
    present: {
      calories: direct.present.calories || derived.present.calories,
      proteinG: direct.present.proteinG || derived.present.proteinG,
      carbsG: direct.present.carbsG || derived.present.carbsG,
      fatG: direct.present.fatG || derived.present.fatG,
    },
  };
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
