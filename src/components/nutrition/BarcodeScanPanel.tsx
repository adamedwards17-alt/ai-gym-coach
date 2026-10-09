"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupBarcodeProduct } from "@/app/actions/nutrition";
import {
  cameraPermissionMessage,
  cameraUnavailableMessage,
  readBrowserCameraEnvironment,
} from "@/lib/barcode-capability";
import { deriveDisplayName } from "@/lib/food-naming";
import type { NutritionEstimate } from "@/lib/nutrition";
import {
  isPlausibleBarcode,
  normalizeBarcode,
  scaleNutrients,
  type OpenFoodFactsNutrients,
  type OpenFoodFactsProduct,
} from "@/lib/open-food-facts";

export type BarcodeConfirmPayload = {
  description: string;
  displayName: string;
  brand: string | null;
  barcode: string;
  estimate: NutritionEstimate;
};

type BarcodeScanPanelProps = {
  /** Called with a reviewed product. The panel never saves anything itself. */
  onConfirm: (payload: BarcodeConfirmPayload) => void;
  onCancel?: () => void;
  disabled?: boolean;
};

type Step = "choose" | "scan" | "manual" | "review";
type Basis = "serving" | "grams";
type MacroKey = "calories" | "proteinG" | "carbsG" | "fatG";

const MACRO_FIELDS: Array<{ key: MacroKey; label: string; unit: string }> = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Carbs", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
];

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

type ScannerControls = { stop: () => void };

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

function parsePositive(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() !== "" && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

function parseNonNegative(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
}

function hasAnyNutrition(n: OpenFoodFactsNutrients | null): boolean {
  return (
    !!n &&
    (n.present.calories ||
      n.present.proteinG ||
      n.present.carbsG ||
      n.present.fatG)
  );
}

/**
 * Per-serving nutrients. Prefers Open Food Facts serving data, filling gaps
 * from per-100g × serving weight when the serving weight is known.
 * Returns null when no serving basis is available.
 */
function servingNutrients(
  product: OpenFoodFactsProduct,
): OpenFoodFactsNutrients | null {
  const derived =
    product.servingQuantityG && hasAnyNutrition(product.per100g)
      ? scaleNutrients(product.per100g, product.servingQuantityG / 100)
      : null;
  const direct = hasAnyNutrition(product.perServing)
    ? product.perServing
    : null;

  if (!direct && !derived) {
    return null;
  }
  if (!direct) {
    return derived;
  }
  if (!derived) {
    return direct;
  }

  const pick = (key: MacroKey): number | null =>
    direct.present[key] ? direct[key] : derived.present[key] ? derived[key] : null;

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

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function BarcodeScanPanel({
  onConfirm,
  onCancel,
  disabled = false,
}: BarcodeScanPanelProps) {
  const [step, setStep] = useState<Step>("choose");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [product, setProduct] = useState<OpenFoodFactsProduct | null>(null);
  const [basis, setBasis] = useState<Basis>("grams");
  const [servings, setServings] = useState("1");
  const [grams, setGrams] = useState("100");
  const [overrides, setOverrides] = useState<Record<MacroKey, string>>({
    calories: "",
    proteinG: "",
    carbsG: "",
    fatG: "",
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<ScannerControls | null>(null);
  const nativeTimerRef = useRef<number | null>(null);

  const stopStream = useCallback(() => {
    if (nativeTimerRef.current != null) {
      window.clearInterval(nativeTimerRef.current);
      nativeTimerRef.current = null;
    }
    try {
      zxingControlsRef.current?.stop();
    } catch {
      // Ignore stop races while tearing down.
    }
    zxingControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const runLookup = useCallback(
    async (rawBarcode: string) => {
      const barcode = normalizeBarcode(rawBarcode);
      if (!isPlausibleBarcode(barcode)) {
        setError("Enter a valid barcode (8–14 digits).");
        setStep("manual");
        return;
      }

      stopStream();
      setError(null);
      setNotice(null);
      setLooking(true);
      setStep("manual");
      setManualBarcode(barcode);

      try {
        const result = await lookupBarcodeProduct({ barcode });
        if (result.status === "ok") {
          const serving = servingNutrients(result.product);
          setProduct(result.product);
          setBasis(serving ? "serving" : "grams");
          setServings("1");
          setGrams(String(result.product.servingQuantityG ?? 100));
          setOverrides({ calories: "", proteinG: "", carbsG: "", fatG: "" });
          setStep("review");
        } else if (result.status === "not_found") {
          setError(
            "We couldn’t find that product. Check the number, or log the food manually instead.",
          );
        } else {
          setError(result.message);
        }
      } catch {
        setError(
          "Product lookup failed. Check your connection and try again, or enter the food manually.",
        );
      } finally {
        setLooking(false);
      }
    },
    [stopStream],
  );

  // Attach the camera preview and run native BarcodeDetector or ZXing decode.
  useEffect(() => {
    if (step !== "scan") {
      return;
    }

    let cancelled = false;
    let finished = false;

    async function startDecoding() {
      const video = videoRef.current;
      const stream = streamRef.current;
      if (!video || !stream) {
        return;
      }

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;
      try {
        await video.play();
      } catch {
        // Autoplay can fail briefly; decoding still proceeds once frames arrive.
      }

      if (cancelled || finished) {
        return;
      }

      const Detector = getBarcodeDetector();
      if (Detector) {
        const detector = new Detector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
        });
        let busy = false;
        nativeTimerRef.current = window.setInterval(() => {
          if (busy || finished || cancelled) {
            return;
          }
          busy = true;
          void detector
            .detect(video)
            .then((codes) => {
              const raw = codes.find((code) => code.rawValue)?.rawValue;
              if (raw && !finished && !cancelled) {
                finished = true;
                void runLookup(raw);
              }
            })
            .catch(() => undefined)
            .finally(() => {
              busy = false;
            });
        }, 350);
        return;
      }

      // Safari / iOS: no BarcodeDetector — decode frames with ZXing.
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
        if (cancelled || finished) {
          return;
        }

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        let controls: ScannerControls | null = null;
        controls = await reader.decodeFromStream(stream, video, (result) => {
          if (!result || finished || cancelled) {
            return;
          }
          const text = result.getText();
          if (text) {
            finished = true;
            try {
              controls?.stop();
            } catch {
              // Ignore.
            }
            void runLookup(text);
          }
        });
        if (cancelled || finished) {
          controls.stop();
          return;
        }
        zxingControlsRef.current = controls;
      } catch {
        if (!cancelled) {
          stopStream();
          setNotice(
            "Barcode decoding failed to start in this browser. Enter the barcode instead.",
          );
          setStep("manual");
        }
      }
    }

    void startDecoding();

    return () => {
      cancelled = true;
      finished = true;
      if (nativeTimerRef.current != null) {
        window.clearInterval(nativeTimerRef.current);
        nativeTimerRef.current = null;
      }
      try {
        zxingControlsRef.current?.stop();
      } catch {
        // Ignore.
      }
      zxingControlsRef.current = null;
    };
  }, [step, runLookup, stopStream]);

  async function startScan() {
    setError(null);
    setNotice(null);

    const { capability } = readBrowserCameraEnvironment();
    if (capability.status !== "ok") {
      setNotice(cameraUnavailableMessage(capability.reason));
      setStep("manual");
      return;
    }

    setStartingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setStep("scan");
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      setNotice(cameraPermissionMessage(name));
      setStep("manual");
    } finally {
      setStartingCamera(false);
    }
  }

  function goManual() {
    stopStream();
    setStep("manual");
  }

  function backToStart() {
    stopStream();
    setProduct(null);
    setError(null);
    setNotice(null);
    setStep("choose");
  }

  // --- Review calculations ---------------------------------------------
  const serving = product ? servingNutrients(product) : null;
  const gramsAmount = parsePositive(grams);
  const multiplier =
    basis === "serving"
      ? parsePositive(servings)
      : gramsAmount == null
        ? null
        : gramsAmount / 100;
  const baseNutrients: OpenFoodFactsNutrients | null = product
    ? basis === "serving"
      ? serving
      : product.per100g
    : null;
  const scaled =
    baseNutrients && multiplier != null
      ? scaleNutrients(baseNutrients, multiplier)
      : null;

  const resolved: Record<MacroKey, number | null> = {
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
  };
  if (scaled) {
    for (const { key } of MACRO_FIELDS) {
      resolved[key] = scaled.present[key]
        ? scaled[key]
        : parseNonNegative(overrides[key]);
    }
  }
  const missingKeys = scaled
    ? MACRO_FIELDS.filter(({ key }) => !scaled.present[key]).map(
        ({ key }) => key,
      )
    : [];
  const readyToConfirm =
    !!product &&
    !!scaled &&
    MACRO_FIELDS.every(({ key }) => resolved[key] != null);

  function portionLabel(): string {
    if (basis === "serving") {
      const count = parsePositive(servings) ?? 1;
      const base = product?.servingSizeLabel ?? "serving";
      return count === 1
        ? `1 serving (${base})`
        : `${formatNumber(count)} servings (${base})`;
    }
    return `${formatNumber(parsePositive(grams) ?? 100)} g`;
  }

  function confirm() {
    if (!product || !readyToConfirm) {
      return;
    }
    const brand = product.brand;
    const name = product.name;
    const description = `${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ` : ""}${name} (${portionLabel()})`;
    const displayName = deriveDisplayName(name, name);

    onConfirm({
      description,
      displayName,
      brand,
      barcode: product.barcode,
      estimate: {
        calories: Math.round(resolved.calories ?? 0),
        proteinG: Math.round(resolved.proteinG ?? 0),
        carbsG: Math.round(resolved.carbsG ?? 0),
        fatG: Math.round(resolved.fatG ?? 0),
        confidence: "high",
        source: "open_food_facts",
        displayName,
        searchAliases: [],
        items: [],
      },
    });
  }

  const inputClass =
    "h-11 rounded-full border border-border bg-surface/60 px-4 text-[14px] text-foreground outline-none focus:border-white/20";
  const secondaryButton =
    "inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60";
  const primaryButton =
    "inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60";

  return (
    <section
      aria-label="Scan a product barcode"
      className="rounded-[1.75rem] border border-border bg-surface/40 p-5"
    >
      {notice ? (
        <p role="status" className="mb-3 text-[13px] leading-5 text-muted">
          {notice}
        </p>
      ) : null}

      {step === "choose" ? (
        <div>
          <p className="font-serif text-[1.35rem] tracking-tight">
            Log a packaged food
          </p>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            Scan the barcode or type the number to pull in the label nutrition.
            Camera scanning needs HTTPS and permission.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={disabled || startingCamera}
              className={primaryButton}
              onClick={() => void startScan()}
            >
              {startingCamera ? "Starting camera…" : "Scan barcode"}
            </button>
            <button
              type="button"
              disabled={disabled || startingCamera}
              className={secondaryButton}
              onClick={goManual}
            >
              Enter barcode
            </button>
            {onCancel ? (
              <button
                type="button"
                className="inline-flex h-11 items-center px-3 text-sm text-muted"
                onClick={onCancel}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === "scan" ? (
        <div>
          <p className="text-[13px] leading-5 text-muted">
            Point the camera at the barcode. Hold steady in good light.
          </p>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Camera preview"
            className="mt-3 aspect-[4/3] w-full rounded-2xl border border-border bg-black object-cover"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={secondaryButton} onClick={goManual}>
              Enter barcode instead
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center px-3 text-sm text-muted"
              onClick={backToStart}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {step === "manual" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void runLookup(manualBarcode);
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Barcode number</span>
            <input
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 5000159484695"
              value={manualBarcode}
              disabled={looking}
              onChange={(event) => setManualBarcode(event.target.value)}
              className={inputClass}
            />
          </label>
          {error ? (
            <p role="alert" className="mt-3 text-[13px] leading-5 text-muted">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={looking || disabled}
              className={primaryButton}
            >
              {looking ? "Looking up…" : "Look up product"}
            </button>
            <button
              type="button"
              disabled={looking}
              className={secondaryButton}
              onClick={backToStart}
            >
              Back
            </button>
          </div>
        </form>
      ) : null}

      {step === "review" && product ? (
        <div>
          <p className="font-serif text-[1.35rem] leading-7 tracking-tight">
            {product.name}
          </p>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            {[product.brand, product.quantityLabel, `Barcode ${product.barcode}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {product.servingSizeLabel ? (
            <p className="mt-0.5 text-[13px] text-muted">
              Serving: {product.servingSizeLabel}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-end gap-3">
            {serving ? (
              <div
                role="group"
                aria-label="Portion basis"
                className="inline-flex rounded-full border border-border p-0.5 text-[13px]"
              >
                {(["serving", "grams"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={basis === option}
                    className={`h-9 rounded-full px-4 ${
                      basis === option
                        ? "bg-foreground text-background"
                        : "text-muted"
                    }`}
                    onClick={() => setBasis(option)}
                  >
                    {option === "serving" ? "Servings" : "Grams"}
                  </button>
                ))}
              </div>
            ) : null}
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] text-muted">
                {basis === "serving" ? "Number of servings" : "Amount (g)"}
              </span>
              <input
                inputMode="decimal"
                value={basis === "serving" ? servings : grams}
                onChange={(event) =>
                  basis === "serving"
                    ? setServings(event.target.value)
                    : setGrams(event.target.value)
                }
                className={`${inputClass} w-32`}
              />
            </label>
          </div>
          {multiplier == null ? (
            <p role="alert" className="mt-2 text-[13px] text-muted">
              Enter an amount greater than zero.
            </p>
          ) : null}
          {basis === "grams" && !product.per100g.present.calories && !serving ? (
            <p className="mt-2 text-[13px] text-muted">
              No per-100g data on this product — fill in the values below for
              your portion.
            </p>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {MACRO_FIELDS.map(({ key, label, unit }) => {
              const isMissing = scaled ? !scaled.present[key] : false;
              return (
                <div key={key}>
                  <dt className="text-[12px] text-muted">{label}</dt>
                  {isMissing ? (
                    <dd className="mt-1">
                      <input
                        inputMode="decimal"
                        aria-label={`${label} (${unit}) — missing from product data`}
                        placeholder={`Enter ${unit}`}
                        value={overrides[key]}
                        onChange={(event) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [key]: event.target.value,
                          }))
                        }
                        className={`${inputClass} w-full`}
                      />
                      <span className="mt-1 block text-[12px] text-muted">
                        Missing from product data
                      </span>
                    </dd>
                  ) : (
                    <dd className="mt-0.5 text-[15px] text-foreground">
                      {scaled && resolved[key] != null
                        ? `${formatNumber(resolved[key] as number)} ${unit}`
                        : "—"}
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>

          {missingKeys.length > 0 ? (
            <p role="status" className="mt-3 text-[13px] leading-5 text-muted">
              Incomplete product data. Add the missing{" "}
              {missingKeys.length === 1 ? "value" : "values"} from the label to
              continue — nothing is assumed.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!readyToConfirm || disabled}
              className={primaryButton}
              onClick={confirm}
            >
              Use this product
            </button>
            <button type="button" className={secondaryButton} onClick={backToStart}>
              Scan another
            </button>
            {onCancel ? (
              <button
                type="button"
                className="inline-flex h-11 items-center px-3 text-sm text-muted"
                onClick={onCancel}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-4 text-muted/80">
        Product data from{" "}
        <a
          href="https://world.openfoodfacts.org"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2"
        >
          Open Food Facts
        </a>
        , a community database (ODbL). Check the pack if anything looks off.
      </p>
    </section>
  );
}
