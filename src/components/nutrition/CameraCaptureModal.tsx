"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupBarcodeProduct } from "@/app/actions/nutrition";
import { processFoodPhoto } from "@/components/nutrition/process-food-photo";
import type { PhotoEstimateResult } from "@/components/nutrition/photo-estimate-result";
import {
  cameraPermissionMessage,
  cameraUnavailableMessage,
  readBrowserCameraEnvironment,
} from "@/lib/barcode-capability";
import { interpretScannedCode } from "@/lib/open-food-facts";
import {
  reviewFromProduct,
  type PhotoLabelRead,
} from "@/lib/photo-nutrition";

type CameraMode = "barcode" | "photo";
type Phase = "opening" | "live" | "preview" | "working" | "fallback" | "manual";

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;
type ScannerControls = { stop: () => void };

let activeStream: MediaStream | null = null;

function releaseStream(stream: MediaStream | null) {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((track) => track.stop());
  if (activeStream === stream) {
    activeStream = null;
  }
}

function claimStream(stream: MediaStream) {
  if (activeStream && activeStream !== stream) {
    releaseStream(activeStream);
  }
  activeStream = stream;
}

function messageForMode(mode: CameraMode, text: string): string {
  if (mode !== "photo") {
    return text;
  }
  return text
    .replaceAll("Enter the barcode instead.", "Choose a photo instead.")
    .replaceAll("enter the barcode instead", "choose a photo instead");
}

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

type CameraCaptureModalProps = {
  mode: CameraMode;
  onClose: () => void;
  onRecognised: (review: PhotoLabelRead) => void;
  onPhotoResult: (result: PhotoEstimateResult) => void;
  onSearch: () => void;
  onSwitchToPhoto: () => void;
};

export function CameraCaptureModal({
  mode,
  onClose,
  onRecognised,
  onPhotoResult,
  onSearch,
  onSwitchToPhoto,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingRef = useRef<ScannerControls | null>(null);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const lookupLock = useRef(false);
  const generation = useRef(0);
  const recognisedRef = useRef(onRecognised);
  useEffect(() => {
    recognisedRef.current = onRecognised;
  }, [onRecognised]);

  const [phase, setPhase] = useState<Phase>("opening");
  const [message, setMessage] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captured, setCaptured] = useState<File | null>(null);
  const [readyFrame, setReadyFrame] = useState(false);

  const stopDecoding = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      zxingRef.current?.stop();
    } catch {
      // Ignore stop races.
    }
    zxingRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    generation.current += 1;
    stopDecoding();
    releaseStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stopDecoding]);

  const close = useCallback(() => {
    stopCamera();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onClose();
  }, [onClose, previewUrl, stopCamera]);

  const startCamera = useCallback(async () => {
    setMessage(null);
    setReadyFrame(false);
    const { capability } = readBrowserCameraEnvironment();
    if (capability.status !== "ok") {
      setMessage(messageForMode(mode, cameraUnavailableMessage(capability.reason)));
      setPhase("fallback");
      return;
    }

    try {
      const permissions = navigator.permissions;
      if (permissions && typeof permissions.query === "function") {
        const status = await permissions.query({
          name: "camera" as PermissionName,
        });
        if (status.state === "denied") {
          setMessage(messageForMode(mode, cameraPermissionMessage("NotAllowedError")));
          setPhase("fallback");
          return;
        }
      }
    } catch {
      // Safari often has no permissions.query. getUserMedia will prompt.
    }

    setPhase("opening");
    const token = generation.current + 1;
    generation.current = token;
    stopDecoding();
    releaseStream(streamRef.current);
    streamRef.current = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (token !== generation.current) {
        releaseStream(stream);
        return;
      }
      claimStream(stream);
      streamRef.current = stream;
      setPhase("live");
    } catch (cause) {
      if (token !== generation.current) {
        return;
      }
      const name = cause instanceof DOMException ? cause.name : "";
      setMessage(messageForMode(mode, cameraPermissionMessage(name)));
      setPhase("fallback");
    }
  }, [mode, stopDecoding]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void startCamera();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const lookup = useCallback(
    async (raw: string) => {
      if (lookupLock.current) {
        return;
      }
      const interpreted = interpretScannedCode(raw);
      if (interpreted.kind === "unsupported") {
        stopDecoding();
        setMessage(interpreted.message);
        setPhase("fallback");
        return;
      }
      lookupLock.current = true;
      stopDecoding();
      stopCamera();
      setPhase("working");
      setMessage(null);
      setManualBarcode(interpreted.barcode);
      try {
        const result = await lookupBarcodeProduct({ barcode: interpreted.barcode });
        if (result.status === "ok") {
          const review = reviewFromProduct(result.product);
          if (review) {
            recognisedRef.current(review);
            return;
          }
          setMessage(
            "That product was found, but it has no nutrition data. Photograph the nutrition label or search instead.",
          );
          setPhase("fallback");
          return;
        }
        if (result.status === "not_found") {
          setMessage(
            "That barcode isn’t in the food database. Try again, enter the number, photograph the nutrition label, or search.",
          );
        } else {
          setMessage(result.message);
        }
        setPhase("fallback");
      } catch {
        setMessage(
          "Product lookup failed. Check your connection, or enter the barcode manually.",
        );
        setPhase("fallback");
      } finally {
        lookupLock.current = false;
      }
    },
    [stopCamera, stopDecoding],
  );

  useEffect(() => {
    if (phase !== "live" || mode !== "barcode") {
      return;
    }
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) {
      return;
    }

    let cancelled = false;
    let finished = false;
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute("playsinline", "true");
    void video.play().catch(() => undefined);

    async function decode() {
      const Detector = getBarcodeDetector();
      if (Detector) {
        const detector = new Detector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
        });
        let busy = false;
        timerRef.current = window.setInterval(() => {
          if (busy || finished || cancelled) {
            return;
          }
          busy = true;
          void detector
            .detect(video!)
            .then((codes) => {
              const raw = codes.find((code) => code.rawValue)?.rawValue;
              if (raw && !finished && !cancelled) {
                finished = true;
                void lookup(raw);
              }
            })
            .catch(() => undefined)
            .finally(() => {
              busy = false;
            });
        }, 350);
        return;
      }

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
          BarcodeFormat.QR_CODE,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromStream(stream!, video!, (result) => {
          if (!result || finished || cancelled) {
            return;
          }
          const text = result.getText();
          if (!text) {
            return;
          }
          finished = true;
          try {
            controls.stop();
          } catch {
            // Ignore.
          }
          void lookup(text);
        });
        if (cancelled || finished) {
          controls.stop();
          return;
        }
        zxingRef.current = controls;
      } catch {
        if (!cancelled) {
          setMessage(
            "Barcode decoding failed to start in this browser. Enter the barcode instead.",
          );
          setPhase("manual");
        }
      }
    }

    void decode();
    return () => {
      cancelled = true;
      finished = true;
      stopDecoding();
    };
  }, [lookup, mode, phase, stopDecoding]);

  useEffect(() => {
    if (phase !== "live" || mode !== "photo") {
      return;
    }
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) {
      return;
    }
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute("playsinline", "true");
    void video.play().catch(() => undefined);
    const markReady = () => {
      if (video.videoWidth > 0) {
        setReadyFrame(true);
      }
    };
    video.addEventListener("loadeddata", markReady);
    const timer = window.setInterval(markReady, 300);
    return () => {
      video.removeEventListener("loadeddata", markReady);
      window.clearInterval(timer);
    };
  }, [mode, phase]);

  async function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), "image/jpeg", 0.92);
    });
    if (!blob) {
      setMessage("Couldn’t capture that frame. Try again.");
      return;
    }
    const file = new File([blob], "food.jpg", { type: "image/jpeg" });
    stopCamera();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCaptured(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhase("preview");
  }

  function retake() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setCaptured(null);
    void startCamera();
  }

  async function confirmPhoto(file: File) {
    setPhase("working");
    setMessage(null);
    const processed = await processFoodPhoto(file);
    if (!processed.ok) {
      setMessage(processed.message);
      setPhase("preview");
      return;
    }
    onPhotoResult(processed.result);
  }

  async function chooseFile(file: File | null) {
    if (!file) {
      return;
    }
    stopCamera();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setCaptured(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPhase("preview");
  }

  const title = mode === "barcode" ? "Scan barcode" : "Take a photo";
  const showVideo = phase === "opening" || phase === "live";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#242B33]/50 px-3 pt-8 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[min(100%,42rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-surface shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 className="text-[16px] font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-semibold text-muted"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {showVideo ? (
            <div className="relative mt-2 overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                aria-label="Camera preview"
                className="max-h-[52vh] w-full object-cover"
              />
              {mode === "barcode" && phase === "live" ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-24 w-[78%] rounded-xl border-2 border-white/80" />
                </div>
              ) : null}
              {phase === "opening" ? (
                <p className="absolute inset-x-0 bottom-3 text-center text-[13px] text-white">
                  Starting camera…
                </p>
              ) : null}
            </div>
          ) : null}

          {phase === "preview" && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Captured food"
              className="mt-2 max-h-80 w-full rounded-2xl object-cover"
            />
          ) : null}

          {phase === "live" && mode === "barcode" ? (
            <p className="mt-3 text-center text-[13px] leading-5 text-muted">
              Point the camera at the barcode. It will scan automatically.
            </p>
          ) : null}
          {phase === "live" && mode === "photo" ? (
            <p className="mt-3 text-center text-[13px] leading-5 text-muted">
              Photograph the food or the nutrition label.
            </p>
          ) : null}
          {phase === "working" ? (
            <p className="mt-4 text-center text-[14px] text-foreground">
              {mode === "barcode" ? "Looking up that product…" : "Reading photo…"}
            </p>
          ) : null}
          {message ? (
            <p role="alert" className="mt-3 text-[13px] leading-5 text-muted">
              {message}
            </p>
          ) : null}

          {phase === "manual" ? (
            <form
              className="mt-3"
              onSubmit={(event) => {
                event.preventDefault();
                void lookup(manualBarcode);
              }}
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-muted">Barcode number</span>
                <input
                  inputMode="numeric"
                  autoComplete="off"
                  value={manualBarcode}
                  onChange={(event) => setManualBarcode(event.target.value)}
                  placeholder="e.g. 5000159484695"
                  className="h-11 rounded-xl border border-border bg-surface px-3 text-[15px] text-foreground outline-none focus:border-primary"
                />
              </label>
              <button
                type="submit"
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white"
              >
                Look up product
              </button>
            </form>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void chooseFile(file);
              event.target.value = "";
            }}
          />

          <div className="mt-4 flex flex-col gap-2">
            {phase === "live" && mode === "photo" ? (
              <button
                type="button"
                disabled={!readyFrame}
                onClick={() => void capture()}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary bg-surface disabled:opacity-50"
                aria-label="Take photo"
              >
                <span className="h-11 w-11 rounded-full bg-primary" />
              </button>
            ) : null}

            {phase === "preview" ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={retake}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border text-sm font-semibold text-foreground"
                >
                  Retake
                </button>
                <button
                  type="button"
                  disabled={!captured}
                  onClick={() => {
                    if (captured) {
                      void confirmPhoto(captured);
                    }
                  }}
                  className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-50"
                >
                  Use photo
                </button>
              </div>
            ) : null}

            {mode === "barcode" && phase !== "working" && phase !== "manual" ? (
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setPhase("manual");
                }}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold text-foreground"
              >
                Enter barcode
              </button>
            ) : null}

            {phase === "fallback" || phase === "manual" ? (
              <>
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white"
                >
                  {mode === "barcode" ? "Scan again" : "Try camera again"}
                </button>
                {mode === "barcode" ? (
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      onSwitchToPhoto();
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold text-foreground"
                  >
                    Photograph the nutrition label
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold text-foreground"
                  >
                    Choose a photo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onSearch();
                  }}
                  className="inline-flex h-11 items-center justify-center text-sm font-semibold text-muted"
                >
                  Back to search
                </button>
              </>
            ) : null}

            {mode === "photo" && (phase === "live" || phase === "opening") ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-11 items-center justify-center text-sm font-semibold text-muted"
              >
                Choose a photo instead
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
