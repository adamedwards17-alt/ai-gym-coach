"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "@/components/nutrition/MealActionIcons";
import {
  blobToBase64,
  getSpeechRecognitionConstructor,
  isBrowserSpeechRecognitionAvailable,
  pickRecorderMimeType,
  prepareCoachImage,
  uploadPreparedCoachImage,
  validateCoachImageFile,
  type PreparedCoachImage,
} from "@/lib/coach-media-client";

export type CoachComposerAttachment = PreparedCoachImage;

type CoachComposerProps = {
  conversationId: string;
  draft: string;
  pending: boolean;
  onDraftChange: (value: string) => void;
  /**
   * Sends text and an optional already-uploaded attachment path.
   * Returns whether the send succeeded so the composer can keep draft/image.
   */
  onSend: (input: {
    content: string;
    attachmentPath: string | null;
    attachmentMimeType: string | null;
    previewUrl: string | null;
  }) => Promise<{ ok: boolean; message?: string }>;
  onTranscribe: (input: {
    audioBase64: string;
    mimeType: string;
  }) => Promise<
    { status: "ok"; transcript: string } | { status: "error"; message: string }
  >;
};

function MicIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="9"
        y="3"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LibraryIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M3 15l4.5-4.5a2 2 0 0 1 2.8 0L16 16M14 13l1.5-1.5a2 2 0 0 1 2.8 0L21 15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="9" r="1.25" fill="currentColor" />
    </svg>
  );
}

function StopIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

export function CoachComposer({
  conversationId,
  draft,
  pending,
  onDraftChange,
  onSend,
  onTranscribe,
}: CoachComposerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<{
    stop: () => void;
    abort: () => void;
  } | null>(null);
  const speechFinalRef = useRef("");
  const cancelledSpeechRef = useRef(false);
  const [attachment, setAttachment] = useState<PreparedCoachImage | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preparingImage, setPreparingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [dictationMode, setDictationMode] = useState<"speech" | "audio" | null>(
    null,
  );
  const [interimTranscript, setInterimTranscript] = useState("");

  useEffect(() => {
    if (!recording) {
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [recording]);

  useEffect(() => {
    return () => {
      stopStream();
      abortSpeech();
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }

  function abortSpeech() {
    cancelledSpeechRef.current = true;
    try {
      speechRef.current?.abort();
    } catch {
      // ignore
    }
    speechRef.current = null;
  }

  function clearAttachment() {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
    setAttachment(null);
  }

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }
    setPickerOpen(false);
    const validated = validateCoachImageFile(file);
    if (!validated.ok) {
      setComposerError(validated.message);
      return;
    }
    setComposerError(null);
    setPreparingImage(true);
    try {
      const prepared = await prepareCoachImage(file);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setAttachment(prepared);
    } catch {
      setComposerError(
        "That photo couldn’t be prepared. Try a JPEG, PNG or screenshot.",
      );
    } finally {
      setPreparingImage(false);
    }
  }

  async function handleSend() {
    if (pending || recording || transcribing || preparingImage || uploading) {
      return;
    }
    const content = draft.trim();
    if (!content && !attachment) {
      return;
    }

    setComposerError(null);
    let attachmentPath: string | null = null;
    let attachmentMimeType: string | null = null;
    const previewUrl = attachment?.previewUrl ?? null;

    if (attachment) {
      setUploading(true);
      const uploaded = await uploadPreparedCoachImage({
        conversationId,
        image: attachment,
      });
      setUploading(false);
      if (uploaded.status !== "ok") {
        setComposerError(uploaded.message);
        return;
      }
      attachmentPath = uploaded.attachmentPath;
      attachmentMimeType = uploaded.mimeType;
    }

    const result = await onSend({
      content,
      attachmentPath,
      attachmentMimeType,
      previewUrl,
    });

    if (!result.ok) {
      setComposerError(
        result.message ?? "That message couldn’t be sent. Try again.",
      );
      return;
    }

    onDraftChange("");
    clearAttachment();
    setComposerError(null);
  }

  function startBrowserSpeech() {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      return false;
    }

    cancelledSpeechRef.current = false;
    speechFinalRef.current = "";
    setInterimTranscript("");
    setDictationMode("speech");
    setComposerError(null);

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          speechFinalRef.current = `${speechFinalRef.current} ${text}`.trim();
        } else {
          interim += text;
        }
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      if (cancelledSpeechRef.current) {
        return;
      }
      const code = event.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        setComposerError(
          "Microphone access was denied. Enable it in Settings to dictate.",
        );
      } else if (code !== "aborted" && code !== "no-speech") {
        // Fall back silently to MediaRecorder path on unsupported engines.
        setComposerError(null);
        void startMediaRecorderFallback();
        return;
      }
      setRecording(false);
      setDictationMode(null);
      setInterimTranscript("");
    };

    recognition.onend = () => {
      if (cancelledSpeechRef.current) {
        setRecording(false);
        setDictationMode(null);
        setInterimTranscript("");
        return;
      }
      const spoken = `${speechFinalRef.current} ${interimTranscript}`.trim();
      if (spoken) {
        const next = draft.trim() ? `${draft.trim()} ${spoken}` : spoken;
        onDraftChange(next);
      } else if (!speechFinalRef.current) {
        setComposerError("I couldn’t catch that. Try again.");
      }
      setRecording(false);
      setDictationMode(null);
      setInterimTranscript("");
      speechRef.current = null;
    };

    speechRef.current = recognition;
    try {
      recognition.start();
      setRecording(true);
      setRecordingSeconds(0);
      return true;
    } catch {
      speechRef.current = null;
      return false;
    }
  }

  async function startMediaRecorderFallback() {
    abortSpeech();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setComposerError("Voice input isn’t available in this browser.");
      return;
    }

    const mimeType = pickRecorderMimeType();
    if (mimeType === null) {
      setComposerError("Voice recording isn’t supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      const recorder = new MediaRecorder(
        stream,
        mimeType
          ? { mimeType, audioBitsPerSecond: 24_000 }
          : { audioBitsPerSecond: 24_000 },
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void finishMediaRecording(recorder.mimeType || mimeType || "audio/mp4");
      };
      mediaRecorderRef.current = recorder;
      // Smaller timeslices keep memory lower on long takes.
      recorder.start(1000);
      setDictationMode("audio");
      setRecording(true);
      setRecordingSeconds(0);
      setComposerError(null);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setComposerError(
          "Microphone access was denied. Enable it in Settings to dictate.",
        );
      } else {
        setComposerError("Microphone couldn’t start. Try again.");
      }
      stopStream();
      setRecording(false);
      setDictationMode(null);
    }
  }

  async function startRecording() {
    if (pending || recording || transcribing || preparingImage || uploading) {
      return;
    }
    setComposerError(null);

    if (isBrowserSpeechRecognitionAvailable()) {
      const started = startBrowserSpeech();
      if (started) {
        return;
      }
    }
    await startMediaRecorderFallback();
  }

  function cancelRecording() {
    cancelledSpeechRef.current = true;
    if (dictationMode === "speech") {
      abortSpeech();
      setRecording(false);
      setDictationMode(null);
      setInterimTranscript("");
      setComposerError(null);
      return;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    stopStream();
    setRecording(false);
    setDictationMode(null);
    setRecordingSeconds(0);
    setComposerError(null);
  }

  function stopRecording() {
    if (dictationMode === "speech") {
      cancelledSpeechRef.current = false;
      try {
        speechRef.current?.stop();
      } catch {
        // ignore
      }
      return;
    }
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecording(false);
      return;
    }
    recorder.stop();
    setRecording(false);
  }

  async function finishMediaRecording(mimeType: string) {
    const chunks = chunksRef.current;
    stopStream();
    if (chunks.length === 0) {
      setComposerError("No audio was captured. Try again.");
      setDictationMode(null);
      return;
    }

    setTranscribing(true);
    setComposerError(null);
    try {
      const blob = new Blob(chunks, { type: mimeType });
      // Soft cap: ~90s at 24kbps is ~270KB; refuse absurd sizes.
      if (blob.size > 2_500_000) {
        setComposerError("That recording is too long. Try a shorter message.");
        return;
      }
      const audioBase64 = await blobToBase64(blob);
      const result = await onTranscribe({
        audioBase64,
        mimeType: mimeType.split(";")[0] || "audio/mp4",
      });
      if (result.status !== "ok") {
        setComposerError(result.message);
        return;
      }
      const next = draft.trim()
        ? `${draft.trim()} ${result.transcript}`
        : result.transcript;
      onDraftChange(next);
    } catch {
      setComposerError("That recording couldn’t be transcribed. Try again.");
    } finally {
      setTranscribing(false);
      setRecordingSeconds(0);
      setDictationMode(null);
    }
  }

  const busy = pending || recording || transcribing || preparingImage || uploading;
  const canSend =
    !busy && (draft.trim().length > 0 || attachment != null);

  const statusLine = uploading
    ? "Uploading photo…"
    : preparingImage
      ? "Preparing photo…"
      : transcribing
        ? "Transcribing…"
        : recording && dictationMode === "speech"
          ? `Listening… ${recordingSeconds}s`
          : recording
            ? `Recording… ${recordingSeconds}s`
            : null;

  return (
    <div className="sticky bottom-20 mt-8 sm:bottom-6">
      {attachment ? (
        <div className="mb-3 flex items-start gap-3 rounded-2xl border border-border/80 bg-surface/60 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.previewUrl}
            alt="Attachment preview"
            className="h-16 w-16 rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-foreground">Photo ready to send</p>
            <p className="mt-0.5 text-[12px] text-muted">
              Coach will use this as chat context — it won’t log food unless you
              ask.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={clearAttachment}
              className="mt-2 text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
            >
              Remove photo
            </button>
          </div>
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-border/80 bg-surface/60 p-3">
          <p className="text-[12px] text-muted">Add a photo</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-60"
            >
              <CameraIcon className="h-4 w-4" />
              Take photo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => libraryInputRef.current?.click()}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-[13px] text-foreground disabled:opacity-60"
            >
              <LibraryIcon className="h-4 w-4" />
              Choose from library
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="inline-flex h-11 items-center rounded-full px-3 text-[13px] text-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {recording ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] text-foreground">
              {statusLine}
              {dictationMode === "speech" && interimTranscript
                ? ` “${interimTranscript}”`
                : ""}
            </p>
            {dictationMode === "speech" ? (
              <p className="mt-0.5 text-[12px] text-muted">
                Live dictation — tap Done when finished.
              </p>
            ) : (
              <p className="mt-0.5 text-[12px] text-muted">
                Tap Done to transcribe.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={cancelRecording}
              className="text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline"
            >
              Cancel
            </button>
            <button
              type="button"
              aria-label="Stop recording"
              onClick={stopRecording}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-background"
            >
              <StopIcon />
              Done
            </button>
          </div>
        </div>
      ) : null}

      {!recording && statusLine ? (
        <p className="mb-3 text-[13px] text-muted" aria-live="polite">
          {statusLine}
        </p>
      ) : null}

      {composerError ? (
        <p role="alert" className="mb-3 text-[13px] leading-6 text-muted">
          {composerError}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <label className="sr-only" htmlFor="coach-composer">
          Message your coach
        </label>
        {/* Separate inputs: capture forces camera on iOS; omit capture for library. */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void handleFile(file);
          }}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void handleFile(file);
          }}
        />
        <div className="flex items-end gap-1 rounded-[1.75rem] border border-border bg-surface/80 p-1.5 shadow-[0_0_0_1px_rgb(255_255_255/0.02)] backdrop-blur">
          <button
            type="button"
            aria-label="Attach a photo"
            title="Attach a photo"
            disabled={busy}
            onClick={() => setPickerOpen((open) => !open)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:opacity-40"
          >
            <CameraIcon />
          </button>
          <textarea
            id="coach-composer"
            rows={1}
            value={draft}
            disabled={busy && !recording}
            placeholder="Message your coach"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted disabled:opacity-60"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <button
            type="button"
            aria-label={recording ? "Stop recording" : "Dictate a message"}
            title={recording ? "Stop recording" : "Dictate a message"}
            disabled={pending || transcribing || preparingImage || uploading}
            onClick={() => {
              if (recording) {
                stopRecording();
              } else {
                void startRecording();
              }
            }}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:opacity-40 ${
              recording
                ? "bg-foreground text-background"
                : "text-foreground/85 hover:bg-white/[0.06] hover:text-foreground"
            }`}
          >
            <MicIcon />
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex h-11 shrink-0 items-center rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
          >
            {uploading ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
