import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coachAttachmentObjectPath,
  coachImageOnlyContent,
  messageHasCoachImage,
  validateCoachAudioAttachment,
  validateCoachImageAttachment,
} from "@/lib/coach-attachments";

describe("coach image attachments", () => {
  it("accepts a small jpeg base64 payload", () => {
    const result = validateCoachImageAttachment({
      imageBase64: Buffer.from("fake-image").toString("base64"),
      mimeType: "image/jpeg",
    });
    assert.equal(result.ok, true);
  });

  it("rejects unsupported mime types", () => {
    const result = validateCoachImageAttachment({
      imageBase64: "aaaa",
      mimeType: "application/pdf",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /format/i);
    }
  });

  it("rejects oversized payloads", () => {
    const huge = "a".repeat(13_000_000);
    const result = validateCoachImageAttachment({
      imageBase64: huge,
      mimeType: "image/png",
    });
    assert.equal(result.ok, false);
  });

  it("builds a user-scoped storage path", () => {
    const path = coachAttachmentObjectPath(
      "user-1",
      "conv-1",
      "file-1",
      "image/png",
    );
    assert.equal(path, "user-1/conv-1/file-1.png");
  });

  it("detects image messages and provides image-only content", () => {
    assert.equal(
      messageHasCoachImage({
        attachment_kind: "image",
        attachment_path: "user/c/f.jpg",
      }),
      true,
    );
    assert.equal(
      messageHasCoachImage({ attachment_kind: null, attachment_path: null }),
      false,
    );
    assert.match(coachImageOnlyContent(), /photo/i);
  });
});

describe("coach audio transcription validation", () => {
  it("accepts webm audio", () => {
    const result = validateCoachAudioAttachment({
      audioBase64: Buffer.from("audio").toString("base64"),
      mimeType: "audio/webm;codecs=opus",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.mimeType, "audio/webm");
    }
  });

  it("rejects empty audio", () => {
    const result = validateCoachAudioAttachment({
      audioBase64: "",
      mimeType: "audio/webm",
    });
    assert.equal(result.ok, false);
  });
});
