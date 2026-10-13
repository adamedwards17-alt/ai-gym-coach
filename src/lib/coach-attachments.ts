/**
 * Coach chat attachment validation and helpers.
 * Images are conversation context — never auto-create nutrition entries.
 */

export const COACH_ATTACHMENT_BUCKET = "coach-attachments";
export const COACH_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const COACH_AUDIO_MAX_BYTES = 12 * 1024 * 1024;

export const COACH_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export const COACH_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/aac",
  "audio/m4a",
] as const;

export type CoachAttachmentKind = "image";

export type CoachImageAttachmentInput = {
  imageBase64: string;
  mimeType: string;
};

export function isCoachImageMimeType(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (COACH_IMAGE_MIME_TYPES as readonly string[]).includes(normalized);
}

export function isCoachAudioMimeType(value: string): boolean {
  const normalized = value.trim().toLowerCase().split(";")[0]!.trim();
  return (COACH_AUDIO_MIME_TYPES as readonly string[]).includes(normalized);
}

export function validateCoachImageAttachment(
  input: CoachImageAttachmentInput,
): { ok: true; mimeType: string; byteLength: number } | { ok: false; message: string } {
  const mimeType = input.mimeType.trim().toLowerCase() || "image/jpeg";
  if (!isCoachImageMimeType(mimeType)) {
    return {
      ok: false,
      message: "That image format isn’t supported. Try JPEG, PNG or WebP.",
    };
  }

  const base64 = input.imageBase64.replace(/\s+/g, "");
  if (!base64) {
    return { ok: false, message: "That image couldn’t be read. Try another photo." };
  }

  // Rough decoded size: 3/4 of base64 length.
  const byteLength = Math.floor((base64.length * 3) / 4);
  if (byteLength > COACH_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      message: "That image is too large. Try a photo under 8 MB.",
    };
  }

  // Hard cap on payload string length for server actions.
  if (base64.length > 12_000_000) {
    return {
      ok: false,
      message: "That image is too large. Try a smaller photo.",
    };
  }

  return { ok: true, mimeType, byteLength };
}

export function validateCoachAudioAttachment(input: {
  audioBase64: string;
  mimeType: string;
}): { ok: true; mimeType: string } | { ok: false; message: string } {
  const mimeType =
    input.mimeType.trim().toLowerCase().split(";")[0]!.trim() || "audio/webm";
  if (!isCoachAudioMimeType(mimeType)) {
    return {
      ok: false,
      message: "That audio format isn’t supported. Try again from the microphone.",
    };
  }

  const base64 = input.audioBase64.replace(/\s+/g, "");
  if (!base64) {
    return { ok: false, message: "No audio was captured. Try recording again." };
  }

  const byteLength = Math.floor((base64.length * 3) / 4);
  if (byteLength > COACH_AUDIO_MAX_BYTES) {
    return {
      ok: false,
      message: "That recording is too long. Try a shorter message.",
    };
  }

  return { ok: true, mimeType };
}

export function coachAttachmentObjectPath(
  userId: string,
  conversationId: string,
  fileId: string,
  mimeType: string,
): string {
  const ext =
    mimeType.includes("png")
      ? "png"
      : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("gif")
          ? "gif"
          : mimeType.includes("heic") || mimeType.includes("heif")
            ? "heic"
            : "jpg";
  return `${userId}/${conversationId}/${fileId}.${ext}`;
}

/** Display / model text when the user sends only an image. */
export function coachImageOnlyContent(): string {
  return "Please look at this photo.";
}

export function messageHasCoachImage(message: {
  attachment_path?: string | null;
  attachment_kind?: string | null;
}): boolean {
  return (
    message.attachment_kind === "image" &&
    typeof message.attachment_path === "string" &&
    message.attachment_path.length > 0
  );
}

/** Paths must be `{userId}/…` so clients cannot attach another user’s object. */
export function isOwnedCoachAttachmentPath(
  userId: string,
  attachmentPath: string,
): boolean {
  if (!userId || !attachmentPath) {
    return false;
  }
  if (attachmentPath.includes("..") || attachmentPath.startsWith("/")) {
    return false;
  }
  return attachmentPath.startsWith(`${userId}/`);
}

/**
 * Server Actions must receive only a Storage path for images — not base64.
 * Passing a phone photo as base64 exceeds Next’s default 1MB action body limit
 * and crashes iPhone Safari with “Unable to load”.
 */
export function coachSendPayloadUsesStoragePath(input: {
  attachmentPath?: string | null;
  imageBase64?: string | null;
}): boolean {
  const hasPath =
    typeof input.attachmentPath === "string" &&
    input.attachmentPath.trim().length > 0;
  const hasInlineBase64 =
    typeof input.imageBase64 === "string" && input.imageBase64.length > 0;
  return hasPath && !hasInlineBase64;
}
