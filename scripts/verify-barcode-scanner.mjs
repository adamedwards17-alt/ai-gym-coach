/**
 * Capability / fallback tests for barcode camera scanning.
 * Run: node scripts/verify-barcode-scanner.mjs
 *
 * MIRRORS helpers in src/lib/barcode-capability.ts — keep in sync.
 */

function isSecureCameraContext(isSecureContext, hostname) {
  if (isSecureContext) return true;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function detectCameraCapability(input) {
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

function detectBarcodeDecodeEngine(hasNativeBarcodeDetector) {
  return {
    engine: hasNativeBarcodeDetector ? "native" : "zxing",
    hasNativeDetector: hasNativeBarcodeDetector,
  };
}

function cameraUnavailableMessage(reason) {
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

function cameraPermissionMessage(errorName) {
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

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed += 1;
}

// Secure context
check(
  "HTTPS is secure",
  isSecureCameraContext(true, "example.vercel.app") === true,
);
check(
  "HTTP production host is insecure",
  isSecureCameraContext(false, "example.vercel.app") === false,
);
check(
  "localhost HTTP allowed",
  isSecureCameraContext(false, "localhost") === true,
);
check(
  "127.0.0.1 HTTP allowed",
  isSecureCameraContext(false, "127.0.0.1") === true,
);

// Camera capability — Safari-like (getUserMedia yes, no native detector)
{
  const capability = detectCameraCapability({
    isSecureContext: true,
    hostname: "app.example.com",
    hasNavigator: true,
    hasMediaDevices: true,
    hasGetUserMedia: true,
  });
  check("Safari-like camera capability is ok", capability.status === "ok");
  const decode = detectBarcodeDecodeEngine(false);
  check(
    "Safari-like decode engine falls back to zxing",
    decode.engine === "zxing" && decode.hasNativeDetector === false,
  );
  check(
    "Camera ok does not require BarcodeDetector",
    capability.status === "ok" && decode.engine === "zxing",
  );
}

// Chrome-like with BarcodeDetector
{
  const decode = detectBarcodeDecodeEngine(true);
  check("Chrome-like uses native engine", decode.engine === "native");
}

// Insecure context → manual fallback message
{
  const capability = detectCameraCapability({
    isSecureContext: false,
    hostname: "insecure.example",
    hasNavigator: true,
    hasMediaDevices: true,
    hasGetUserMedia: true,
  });
  check(
    "insecure context unavailable",
    capability.status === "unavailable" &&
      capability.reason === "insecure_context",
  );
  const msg = cameraUnavailableMessage(capability.reason);
  check("insecure message mentions HTTPS", msg.includes("HTTPS"));
  check("insecure message offers manual entry", msg.includes("barcode"));
}

// Missing getUserMedia
{
  const capability = detectCameraCapability({
    isSecureContext: true,
    hostname: "app.example.com",
    hasNavigator: true,
    hasMediaDevices: true,
    hasGetUserMedia: false,
  });
  check(
    "no getUserMedia → unavailable",
    capability.status === "unavailable" &&
      capability.reason === "no_get_user_media",
  );
}

// Permission messages
check(
  "permission denied message is specific",
  cameraPermissionMessage("NotAllowedError").includes("blocked"),
);
check(
  "missing camera message is specific",
  cameraPermissionMessage("NotFoundError").includes("No camera"),
);
check(
  "generic camera failure still offers manual entry",
  cameraPermissionMessage("UnknownError").includes("barcode"),
);

// Old bug: requiring BarcodeDetector blocked Safari even when camera works
{
  const capability = detectCameraCapability({
    isSecureContext: true,
    hostname: "app.example.com",
    hasNavigator: true,
    hasMediaDevices: true,
    hasGetUserMedia: true,
  });
  const decode = detectBarcodeDecodeEngine(false);
  const oldBuggyGate = !decode.hasNativeDetector || capability.status !== "ok";
  const fixedGate = capability.status !== "ok";
  check(
    "old BarcodeDetector gate would wrongly block Safari",
    oldBuggyGate === true,
  );
  check(
    "fixed gate allows Safari camera (ZXing decode)",
    fixedGate === false && decode.engine === "zxing",
  );
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll barcode-scanner capability checks passed.");
