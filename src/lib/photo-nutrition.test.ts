import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { interpretScannedCode } from "@/lib/open-food-facts";
import { parsePhotoNutritionResponse } from "@/lib/photo-nutrition";
import type { OpenFoodFactsProduct } from "@/lib/open-food-facts";
import { reviewFromProduct } from "@/lib/photo-nutrition";

function label(json: unknown) {
  return parsePhotoNutritionResponse(JSON.stringify(json));
}

describe("parsePhotoNutritionResponse", () => {
  it("reads per-serving numbers from a nutrition label", () => {
    const parsed = label({
      image_kind: "nutrition_label",
      product_name: "Protein bar",
      brand: "Example",
      serving_size: "40 g",
      basis: "per_serving",
      per_serving: { calories: 180, protein_g: 20, carbs_g: 15, fat_g: 6 },
      per_100: { calories: 450, protein_g: 50, carbs_g: 37, fat_g: 15 },
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.equal(parsed.estimate.calories, 180);
    assert.equal(parsed.estimate.proteinG, 20);
    assert.equal(parsed.basis, "per_serving");
    assert.match(parsed.description, /40 g/);
    assert.deepEqual(parsed.missing, []);
    assert.equal(parsed.estimate.confidence, "high");
  });

  it("uses per 100 g when that is the only basis", () => {
    const parsed = label({
      image_kind: "nutrition_label",
      product_name: "Yogurt",
      per_100: { calories: 97, protein_g: 4.5, carbs_g: 12, fat_g: 3 },
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.equal(parsed.basis, "per_100");
    assert.equal(parsed.estimate.calories, 97);
    assert.match(parsed.notice, /100 g/);
    assert.match(parsed.description, /100 g/);
  });

  it("prefers per 100 g when both columns exist but the serving is unclear", () => {
    const parsed = label({
      image_kind: "nutrition_label",
      product_name: "Granola",
      per_serving: { calories: 150, protein_g: 3, carbs_g: 20, fat_g: 6 },
      per_100: { calories: 468, protein_g: 9, carbs_g: 62, fat_g: 18 },
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.equal(parsed.estimate.calories, 468);
    assert.equal(parsed.basis, "per_100");
    assert.match(parsed.notice, /Confirm how much you ate/);
  });

  it("keeps readable values when protein is missing and does not invent it", () => {
    const parsed = label({
      image_kind: "nutrition_label",
      product_name: "Crackers",
      serving_size: "30 g",
      per_serving: { calories: 120, protein_g: null, carbs_g: 18, fat_g: 4 },
      items: [{ description: "Crackers", calories: 120, protein_g: 20, carbs_g: 18, fat_g: 4 }],
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.equal(parsed.estimate.calories, 120);
    assert.equal(parsed.estimate.carbsG, 18);
    assert.deepEqual(parsed.missing, ["proteinG"]);
    assert.match(parsed.notice, /protein/);
    assert.equal(parsed.estimate.proteinG, 0);
  });

  it("keeps a printed zero instead of treating it as missing", () => {
    const parsed = label({
      image_kind: "nutrition_label",
      product_name: "Diet soda",
      serving_size: "330 ml",
      per_serving: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.equal(parsed.estimate.calories, 0);
    assert.deepEqual(parsed.missing, []);
  });

  it("converts kilojoules to kilocalories when the label has no kcal figure", () => {
    const parsed = label({
      image_kind: "nutrition_label",
      product_name: "Soup",
      serving_size: "1 bowl",
      per_serving: {
        energy_kj: 840,
        energy_unit: "kj",
        protein_g: 10,
        carbs_g: 20,
        fat_g: 5,
      },
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.equal(parsed.estimate.calories, Math.round(840 / 4.184));
  });

  it("mentions fibre and saturated fat without storing them as diary macros", () => {
    const parsed = label({
      image_kind: "nutrition_label",
      product_name: "Bread",
      serving_size: "1 slice",
      per_serving: { calories: 90, protein_g: 4, carbs_g: 16, fat_g: 1 },
      fibre_g: 2.4,
      saturated_fat_g: 0.2,
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.match(parsed.notice, /fibre 2.4 g/);
    assert.match(parsed.notice, /saturated fat 0.2 g/);
    assert.equal("fibreG" in parsed.estimate, false);
  });

  it("explains a blurry label instead of dropping the attempt", () => {
    const parsed = label({
      image_kind: "unreadable",
      message: "The label is too blurry to read the calories.",
    });
    assert.deepEqual(parsed, {
      kind: "unreadable",
      message: "The label is too blurry to read the calories.",
    });
  });

  it("still estimates a photograph of food", () => {
    const parsed = label({
      image_kind: "food",
      display_name: "Chicken and rice",
      totals: { calories: 540, protein_g: 42, carbs_g: 48, fat_g: 14 },
      confidence: "low",
      items: [],
    });
    assert.equal(parsed.kind, "food");
    if (parsed.kind !== "food") {
      return;
    }
    assert.equal(parsed.estimate.calories, 540);
    assert.equal(parsed.description, "Chicken and rice");
  });

  it("lets a readable label win when the photo also shows the food", () => {
    const parsed = label({
      image_kind: "mixed",
      product_name: "Cereal",
      serving_size: "45 g",
      per_serving: { calories: 170, protein_g: 5, carbs_g: 32, fat_g: 2 },
      totals: { calories: 900, protein_g: 20, carbs_g: 80, fat_g: 10 },
    });
    assert.equal(parsed.kind, "label");
    if (parsed.kind !== "label") {
      return;
    }
    assert.equal(parsed.estimate.calories, 170);
  });
});

describe("interpretScannedCode", () => {
  it("accepts a conventional barcode", () => {
    assert.deepEqual(interpretScannedCode("5000159484695"), {
      kind: "barcode",
      barcode: "5000159484695",
    });
  });

  it("reads a barcode from an Open Food Facts or GS1 URL", () => {
    assert.deepEqual(
      interpretScannedCode(
        "https://world.openfoodfacts.org/product/5000159484695",
      ),
      { kind: "barcode", barcode: "5000159484695" },
    );
    assert.deepEqual(
      interpretScannedCode("https://id.gs1.org/01/09506000134352"),
      { kind: "barcode", barcode: "09506000134352" },
    );
  });

  it("does not treat a website QR code as a product", () => {
    const result = interpretScannedCode("https://brand.example/promo");
    assert.equal(result.kind, "unsupported");
    if (result.kind === "unsupported") {
      assert.match(result.message, /nutrition label/);
    }
  });
});

describe("reviewFromProduct", () => {
  it("uses per-serving product data and keeps missing macros empty", () => {
    const product: OpenFoodFactsProduct = {
      barcode: "5000159484695",
      name: "Example bar",
      brand: "Example",
      quantityLabel: "40 g",
      servingSizeLabel: "40 g",
      per100g: {
        calories: 450,
        proteinG: null,
        carbsG: 40,
        fatG: 15,
        present: { calories: true, proteinG: false, carbsG: true, fatG: true },
      },
      perServing: {
        calories: 180,
        proteinG: null,
        carbsG: 16,
        fatG: 6,
        present: { calories: true, proteinG: false, carbsG: true, fatG: true },
      },
      servingQuantityG: 40,
      imageUrl: null,
      incomplete: true,
    };
    const review = reviewFromProduct(product);
    assert.ok(review);
    assert.equal(review?.estimate.calories, 180);
    assert.equal(review?.estimate.source, "open_food_facts");
    assert.deepEqual(review?.missing, ["proteinG"]);
    assert.match(review?.notice ?? "", /barcode/);
  });
});
