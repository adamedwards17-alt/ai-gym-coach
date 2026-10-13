/**
 * Client-side Coach media helpers: image compress/upload and speech capture.
 * Images are uploaded directly to private Storage — never via Server Action
 * payloads (Next.js defaults to a 1MB action body limit).
 */

import {
  COACH_ATTACHMENT_BUCKET,
  COACH_IMAGE_MAX_BYTES,
  coachAttachmentObjectPath,
  isCoachImageMimeType,
} from "@/lib/coach-attachments";
import { createClient } from "@/lib/supabase/client";

export const COACH_IMAGE_MAX_DIMENSION = 1600;
export const COACH_IMAGE_JPEG_QUALITY = 0.72;
/** Target max compressed image bytes before upload (~1.2MB). */
export const COACH_IMAGE_TARGET_BYTES = 1_200_000;

export type PreparedCoachImage = {
  previewUrl: string;
  blob: Blob;
  mimeType: "image/jpeg";
  /** Approximate original file size before compression. */
  sourceBytes: number;
};

export function validateCoachImageFile(
  file: File,
): { ok: true } | { ok: false; message: string } {
  const mime = (file.type || "").trim().toLowerCase();
  // Empty MIME is common for some iOS screenshots — allow and compress to JPEG.
  if (mime && !mime.startsWith("image/")) {
    return {
      ok: false,
      message: "That image format isn’t supported. Try JPEG, PNG or a screenshot.",
    };
  }
  if (mime && mime.startsWith("image/") && !isCoachImageMimeType(mime)) {
    // Unknown image/* may still decode via canvas (e.g. some HEIC variants).
    if (!mime.includes("heic") && !mime.includes("heif")) {
      return {
        ok: false,
        message:
          "That image format isn’t supported. Try JPEG, PNG or a screenshot.",
      };
    }
  }
  if (file.size > COACH_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: "That image is too large. Try a photo under 8 MB.",
    };
  }
  return { ok: true };
}

async function loadImageBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to HTMLImageElement (helps some HEIC / screenshot cases).
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new Error("That photo couldn’t be decoded on this device."));
      img.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas unavailable");
    }
    ctx.drawImage(image, 0, 0);
    return await createImageBitmap(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Resize and re-encode to JPEG so uploads stay small enough for mobile networks
 * and Gemini, while avoiding HEIC/HEIF upload issues.
 */
export async function prepareCoachImage(
  file: File,
): Promise<PreparedCoachImage> {
  const bitmap = await loadImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      COACH_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas unavailable");
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = COACH_IMAGE_JPEG_QUALITY;
    let blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((value) => resolve(value), "image/jpeg", quality),
    );

    // Further reduce quality if still large.
    while (
      blob &&
      blob.size > COACH_IMAGE_TARGET_BYTES &&
      quality > 0.45
    ) {
      quality -= 0.1;
      blob = await new Promise((resolve) =>
        canvas.toBlob((value) => resolve(value), "image/jpeg", quality),
      );
    }

    if (!blob || blob.size === 0) {
      throw new Error("Image compression failed");
    }

    return {
      previewUrl: URL.createObjectURL(blob),
      blob,
      mimeType: "image/jpeg",
      sourceBytes: file.size,
    };
  } finally {
    bitmap.close();
  }
}

export async function uploadPreparedCoachImage(input: {
  conversationId: string;
  image: PreparedCoachImage;
}): Promise<
  | { status: "ok"; attachmentPath: string; mimeType: string }
  | { status: "error"; message: string }
> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { status: "error", message: "You’re not signed in." };
    }

    const fileId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const path = coachAttachmentObjectPath(
      user.id,
      input.conversationId,
      fileId,
      input.image.mimeType,
    );

    const { error } = await supabase.storage
      .from(COACH_ATTACHMENT_BUCKET)
      .upload(path, input.image.blob, {
        contentType: input.image.mimeType,
        upsert: false,
      });

    if (error) {
      console.error("[coach] Client image upload failed:", error.message);
      return {
        status: "error",
        message: "That photo couldn’t be uploaded. Try again.",
      };
    }

    return {
      status: "ok",
      attachmentPath: path,
      mimeType: input.image.mimeType,
    };
  } catch (error) {
    console.error("[coach] Client image upload exception:", error);
    return {
      status: "error",
      message: "That photo couldn’t be uploaded. Try again.",
    };
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** @deprecated Prefer blobToBase64 — kept for audio path naming clarity. */
export async function fileToBase64(file: Blob): Promise<string> {
  return blobToBase64(file);
}

export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }
  const candidates = [
    "audio/mp4",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> & {
      length: number;
    };
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSpeechRecognitionAvailable(): boolean {
  return getSpeechRecognitionConstructor() != null;
}
