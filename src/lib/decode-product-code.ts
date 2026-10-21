type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"];

function nativeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * Read one barcode or QR code from a still photo.
 * Returns null when the image has no supported code.
 */
export async function decodeProductCodeFromImage(
  image: HTMLImageElement,
): Promise<string | null> {
  const Detector = nativeDetector();
  if (Detector) {
    try {
      const codes = await new Detector({ formats: FORMATS }).detect(image);
      const raw = codes.find((code) => code.rawValue?.trim())?.rawValue?.trim();
      if (raw) {
        return raw;
      }
    } catch {
      // Fall through to the JS decoder used by Safari.
    }
  }

  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    const result = await reader.decodeFromImageElement(image);
    const text = result.getText()?.trim();
    return text || null;
  } catch {
    return null;
  }
}
