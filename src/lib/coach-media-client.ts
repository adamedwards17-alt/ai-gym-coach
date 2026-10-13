/**
 * Client-side helpers for Coach photo / voice capture.
 */

import {
  COACH_IMAGE_MAX_BYTES,
  isCoachImageMimeType,
} from "@/lib/coach-attachments";

export async function fileToBase64(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function validateCoachImageFile(
  file: File,
): { ok: true } | { ok: false; message: string } {
  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!isCoachImageMimeType(mime)) {
    return {
      ok: false,
      message: "That image format isn’t supported. Try JPEG, PNG or WebP.",
    };
  }
  if (file.size > COACH_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: "That image is too large. Try a photo under 8 MB.",
    };
  }
  return { ok: true };
}

export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  // Some browsers support MediaRecorder without advertising mime types.
  return "";
}
