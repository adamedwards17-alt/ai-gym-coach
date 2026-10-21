"use client";

import { useRef, useState } from "react";
import {
  estimateNutritionFromPhoto,
  lookupBarcodeProduct,
} from "@/app/actions/nutrition";
import { decodeProductCodeFromImage } from "@/lib/decode-product-code";
import type { NutritionEstimate } from "@/lib/nutrition";
import { interpretScannedCode } from "@/lib/open-food-facts";
import {
  reviewFromProduct,
  type PhotoMacroKey,
} from "@/lib/photo-nutrition";

export type PhotoEstimateResult = {
  kind: "food" | "label";
  description: string;
  estimate: NutritionEstimate;
  notice: string | null;
  brand?: string | null;
  barcode?: string | null;
  missing?: PhotoMacroKey[];
};

type PhotoEstimatePanelProps = {
  disabled?: boolean;
  onCancel: () => void;
  onEstimated: (result: PhotoEstimateResult) => void;
};

export function PhotoEstimatePanel({
  disabled = false,
  onCancel,
  onEstimated,
}: PhotoEstimatePanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose a photo of your meal.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is too large. Try a smaller photo under 8 MB.");
      return;
    }

    setError(null);
    setNote(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setBusy(true);

    try {
      const code = await readCodeFromPreview(objectUrl);
      if (code) {
        const interpreted = interpretScannedCode(code);
        if (interpreted.kind === "unsupported") {
          setError(interpreted.message);
          return;
        }
        const lookup = await lookupBarcodeProduct({ barcode: interpreted.barcode });
        if (lookup.status === "ok") {
          const review = reviewFromProduct(lookup.product);
          if (review) {
            onEstimated({
              kind: "label",
              description: review.description,
              estimate: review.estimate,
              notice: review.notice,
              brand: review.brand,
              barcode: review.barcode,
              missing: review.missing,
            });
            return;
          }
        }
        if (lookup.status === "error") {
          setError(lookup.message);
          return;
        }
        setNote(
          "That barcode isn’t in the food database. Reading the nutrition label instead.",
        );
      }

      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);

      const result = await estimateNutritionFromPhoto({
        imageBase64: base64,
        mimeType: file.type || "image/jpeg",
      });

      if (result.status === "needs_review" || result.status === "ok") {
        const foodNotice =
          result.kind === "food"
            ? (result.message ??
              "Photo estimates are approximate — please review before saving.")
            : (result.message ?? null);
        onEstimated({
          kind: result.kind,
          description: result.description,
          estimate: result.estimate,
          notice: foodNotice,
          brand: result.brand,
          barcode: result.barcode,
          missing: result.missing,
        });
        return;
      }

      if (result.status === "needs_clarification") {
        setError(result.question);
        return;
      }

      setError(
        result.status === "error"
          ? result.message
          : "That photo couldn’t be estimated. Try again or log manually.",
      );
    } catch {
      setError("That photo couldn’t be estimated. Try again or log manually.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/80 bg-surface/35 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Photo estimate
          </p>
          <h2 className="mt-2 font-serif text-[1.45rem] tracking-tight">
            Photo or nutrition label
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            Photograph the food or the nutrition panel. Label numbers are read
            from the pack. You’ll review them before anything is saved.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleFile(file);
          event.target.value = "";
        }}
      />

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Meal preview"
          className="mt-4 max-h-56 w-full rounded-2xl object-cover"
        />
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? "Reading photo…" : previewUrl ? "Choose another photo" : "Take or choose photo"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
        >
          Back
        </button>
      </div>

      {note ? <p className="mt-3 text-[13px] text-muted">{note}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {error}
        </p>
      ) : null}
    </section>
  );
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
