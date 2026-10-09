/**
 * Capability detection for camera barcode scanning.
 * Separates camera access from the native BarcodeDetector API so Safari
 * (which lacks BarcodeDetector) can still scan via a JS decoder.
 */

export type CameraCapability =
  | { status: "ok" }
  | {
      status: "unavailable";
      reason:
        | "insecure_context"
        | "no_media_devices"
        | "no_get_user_media"
        | "ssr";
    };

export type BarcodeDecodeEngine = "native" | "zxing";

export function isSecureCameraContext(
  isSecureContext: boolean,
  hostname: string,
): boolean {
  if (isSecureContext) {
    return true;
  }
  // Local development over plain HTTP is still allowed by browsers.
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

export function detectCameraCapability(input: {
  isSecureContext: boolean;
  hostname: string;
  hasNavigator: boolean;
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
}): CameraCapability {
  if (!input.hasNavigator) {
    return { status: "unavailable", reason: "ssr" };
  }
  if (!isSecureCameraContext(input.isSecureContext, input.hostname)) {
    return { status: "unavailable", reason: "insecure_context" };
  }
  if (!input.hasMediaDevices) {
    return { status: "unavailable", reason: "no_media_devices" };
  }
  if (!input.hasGetUserMedia) {
    return { status: "unavailable", reason: "no_get_user_media" };
  }
  return { status: "ok" };
}

export function detectBarcodeDecodeEngine(hasNativeBarcodeDetector: boolean): {
  engine: BarcodeDecodeEngine;
  hasNativeDetector: boolean;
} {
  return {
    engine: hasNativeBarcodeDetector ? "native" : "zxing",
    hasNativeDetector: hasNativeBarcodeDetector,
  };
}

export function cameraUnavailableMessage(
  reason: Exclude<CameraCapability, { status: "ok" }>["reason"],
): string {
  switch (reason) {
    case "insecure_context":
      return "Camera access needs a secure connection (HTTPS). Open the app from its https:// address, or enter the barcode instead.";
    case "no_media_devices":
    case "no_get_user_media":
      return "This browser can’t access the camera. Enter the barcode instead.";
    case "ssr":
      return "Camera isn’t ready yet. Try again, or enter the barcode instead.";
  }
}

export function cameraPermissionMessage(errorName: string): string {
  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    return "Camera access was blocked. Allow camera permission for this site in Safari Settings, then try again — or enter the barcode instead.";
  }
  if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
    return "No camera was found on this device. Enter the barcode instead.";
  }
  if (errorName === "NotReadableError" || errorName === "TrackStartError") {
    return "The camera is in use by another app. Close it and try again, or enter the barcode instead.";
  }
  if (errorName === "OverconstrainedError") {
    return "Couldn’t use the rear camera. Enter the barcode instead, or try again.";
  }
  return "The camera couldn’t be started. Enter the barcode instead.";
}

/** Snapshot of browser capabilities for client components. */
export function readBrowserCameraEnvironment(): {
  capability: CameraCapability;
  decode: ReturnType<typeof detectBarcodeDecodeEngine>;
} {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      capability: { status: "unavailable", reason: "ssr" },
      decode: detectBarcodeDecodeEngine(false),
    };
  }

  const hasBarcodeDetector =
    typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector ===
    "function";

  return {
    capability: detectCameraCapability({
      isSecureContext: window.isSecureContext,
      hostname: window.location.hostname,
      hasNavigator: true,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    }),
    decode: detectBarcodeDecodeEngine(hasBarcodeDetector),
  };
}
