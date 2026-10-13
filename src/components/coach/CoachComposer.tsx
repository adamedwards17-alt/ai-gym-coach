"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon } from "@/components/nutrition/MealActionIcons";
import {
  fileToBase64,
  pickRecorderMimeType,
  validateCoachImageFile,
} from "@/lib/coach-media-client";

export type CoachComposerAttachment = {
  previewUrl: string;
  imageBase64: string;
  mimeType: string;
};

type CoachComposerProps = {
  draft: string;
  pending: boolean;
  onDraftChange: (value: string) => void;
  onSend: (input: {
    content: string;
    image: CoachComposerAttachment | null;
  }) => void;
  onTranscribe: (input: {
    audioBase64: string;
    mimeType: string;
  }) => Promise<{ status: "ok"; transcript: string } | { status: "error"; message: string }>;
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

function StopIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

export function CoachComposer({
  draft,
  pending,
  onDraftChange,
  onSend,
  onTranscribe,
}: CoachComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [attachment, setAttachment] = useState<CoachComposerAttachment | null>(
    null,
  );
  const [composerError, setComposerError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

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
    };
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
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
    const validated = validateCoachImageFile(file);
    if (!validated.ok) {
      setComposerError(validated.message);
      return;
    }
    setComposerError(null);
    try {
      const imageBase64 = await fileToBase64(file);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setAttachment({
        previewUrl: URL.createObjectURL(file),
        imageBase64,
        mimeType: file.type || "image/jpeg",
      });
    } catch {
      setComposerError("That photo couldn’t be read. Try another image.");
    }
  }

  function handleSend() {
    if (pending || recording || transcribing) {
      return;
    }
    const content = draft.trim();
    if (!content && !attachment) {
      return;
    }
    onSend({ content, image: attachment });
    onDraftChange("");
    clearAttachment();
    setComposerError(null);
  }

  async function startRecording() {
    if (pending || recording || transcribing) {
      return;
    }
    setComposerError(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void finishRecording(recorder.mimeType || mimeType || "audio/webm");
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setRecordingSeconds(0);
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setComposerError(
          "Microphone access was denied. Enable it in browser settings to dictate.",
        );
      } else {
        setComposerError("Microphone couldn’t start. Try again.");
      }
      stopStream();
      setRecording(false);
    }
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    stopStream();
    setRecording(false);
    setRecordingSeconds(0);
    setComposerError(null);
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setRecording(false);
      return;
    }
    recorder.stop();
    setRecording(false);
  }

  async function finishRecording(mimeType: string) {
    const chunks = chunksRef.current;
    stopStream();
    if (chunks.length === 0) {
      setComposerError("No audio was captured. Try again.");
      return;
    }

    setTranscribing(true);
    setComposerError(null);
    try {
      const blob = new Blob(chunks, { type: mimeType });
      const audioBase64 = await fileToBase64(blob);
      const result = await onTranscribe({
        audioBase64,
        mimeType: mimeType.split(";")[0] || "audio/webm",
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
    }
  }

  const canSend =
    !pending &&
    !recording &&
    !transcribing &&
    (draft.trim().length > 0 || attachment != null);

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
              disabled={pending}
              onClick={clearAttachment}
              className="mt-2 text-[12px] text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-60"
            >
              Remove photo
            </button>
          </div>
        </div>
      ) : null}

      {recording ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-border/80 bg-surface/60 px-4 py-3">
          <p className="text-[13px] text-foreground">
            Recording… {recordingSeconds}s
          </p>
          <div className="flex items-center gap-2">
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

      {transcribing ? (
        <p className="mb-3 text-[13px] text-muted">Transcribing…</p>
      ) : null}

      {composerError ? (
        <p role="alert" className="mb-3 text-[13px] leading-6 text-muted">
          {composerError}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleSend();
        }}
      >
        <label className="sr-only" htmlFor="coach-composer">
          Message your coach
        </label>
        <div className="flex items-end gap-1 rounded-[1.75rem] border border-border bg-surface/80 p-1.5 shadow-[0_0_0_1px_rgb(255_255_255/0.02)] backdrop-blur">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void handleFile(file);
            }}
          />
          <button
            type="button"
            aria-label="Attach a photo"
            title="Attach a photo"
            disabled={pending || recording || transcribing}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:opacity-40"
          >
            <CameraIcon />
          </button>
          <textarea
            id="coach-composer"
            rows={1}
            value={draft}
            disabled={pending || recording || transcribing}
            placeholder="Message your coach"
            className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted disabled:opacity-60"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            aria-label={recording ? "Stop recording" : "Dictate a message"}
            title={recording ? "Stop recording" : "Dictate a message"}
            disabled={pending || transcribing}
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
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
