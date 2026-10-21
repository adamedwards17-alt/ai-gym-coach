import type { NutritionEstimate } from "@/lib/nutrition";
import type { PhotoMacroKey } from "@/lib/photo-nutrition";

export type PhotoEstimateResult = {
  kind: "food" | "label";
  description: string;
  estimate: NutritionEstimate;
  notice: string | null;
  brand?: string | null;
  barcode?: string | null;
  missing?: PhotoMacroKey[];
};
