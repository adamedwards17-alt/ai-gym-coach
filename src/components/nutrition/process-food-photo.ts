"use client";

import {
  estimateNutritionFromPhoto,
  lookupBarcodeProduct,
} from "@/app/actions/nutrition";
import { decodeProductCodeFromImage } from "@/lib/decode-product-code";
import { interpretScannedCode } from "@/lib/open-food-facts";
import { reviewFromProduct } from "@/lib/photo-nutrition";
import type { PhotoEstimateResult } from "@/components/nutrition/photo-estimate-result";

export type { PhotoEstimateResult };

export async function processFoodPhoto(
  file: File,
): Promise<{ ok: true; result: PhotoEstimateResult } | { ok: false; message: string }> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, message: "Choose a photo of your meal or its nutrition label." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { ok: false, message: "That image is too large. Try a smaller photo under 8 MB." };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const code = await readCodeFromPreview(objectUrl);
    if (code) {
      const interpreted = interpretScannedCode(code);
      if (interpreted.kind === "unsupported") {
        return { ok: false, message: interpreted.message };
      }
      const lookup = await lookupBarcodeProduct({ barcode: interpreted.barcode });
      if (lookup.status === "ok") {
        const review = reviewFromProduct(lookup.product);
        if (review) {
          return {
            ok: true,
            result: {
              kind: "label",
              description: review.description,
              estimate: review.estimate,
              notice: review.notice,
              brand: review.brand,
              barcode: review.barcode,
              missing: review.missing,
            },
          };
        }
      }
      if (lookup.status === "error") {
        return { ok: false, message: lookup.message };
      }
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]!);
    }

    const result = await estimateNutritionFromPhoto({
      imageBase64: btoa(binary),
      mimeType: file.type || "image/jpeg",
    });

    if (result.status === "needs_review" || result.status === "ok") {
      return {
        ok: true,
        result: {
          kind: result.kind,
          description: result.description,
          estimate: result.estimate,
          notice:
            result.kind === "food"
              ? (result.message ??
                "Photo estimates are approximate — please review before saving.")
              : (result.message ?? null),
          brand: result.brand,
          barcode: result.barcode,
          missing: result.missing,
        },
      };
    }

    if (result.status === "needs_clarification") {
      return { ok: false, message: result.question };
    }

    return {
      ok: false,
      message:
        result.status === "error"
          ? result.message
          : "That photo couldn’t be read. Try again or log manually.",
    };
  } catch {
    return {
      ok: false,
      message: "That photo couldn’t be read. Try again or log manually.",
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readCodeFromPreview(objectUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), 2500);
    image.onload = () => {
      void decodeProductCodeFromImage(image)
        .then((code) => {
          window.clearTimeout(timer);
          resolve(code);
        })
        .catch(() => {
          window.clearTimeout(timer);
          resolve(null);
        });
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = objectUrl;
  });
}
