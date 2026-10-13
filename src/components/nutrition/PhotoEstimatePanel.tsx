"use client";

import { useRef, useState } from "react";
import { estimateNutritionFromPhoto } from "@/app/actions/nutrition";
import type { NutritionEstimate } from "@/lib/nutrition";

export type PhotoEstimateResult = {
  description: string;
  estimate: NutritionEstimate;
  notice: string | null;
};

type PhotoEstimatePanelProps = {
  disabled?: boolean;
  onCancel: () => void;
  onEstimated: (result: PhotoEstimateResult) => void;
};

export function PhotoEstimatePanel({
  disabled = false,
  onCancel,
  onEstimated,
}: PhotoEstimatePanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Choose a photo of your meal.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("That image is too large. Try a smaller photo under 8 MB.");
      return;
    }

    setError(null);
    setNote(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setBusy(true);

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);

      const result = await estimateNutritionFromPhoto({
        imageBase64: base64,
        mimeType: file.type || "image/jpeg",
      });

      if (result.status === "needs_review" || result.status === "ok") {
        onEstimated({
          description: result.description,
          estimate: result.estimate,
          notice:
            result.status === "needs_review"
              ? (result.message ??
                "Photo estimates are approximate — please review before saving.")
              : "Photo estimates are approximate — portions and hidden ingredients may be off.",
        });
        return;
      }

      if (result.status === "needs_clarification") {
        setError(result.question);
        return;
      }

      setError(
        result.status === "error"
          ? result.message
          : "That photo couldn’t be estimated. Try again or log manually.",
      );
    } catch {
      setError("That photo couldn’t be estimated. Try again or log manually.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[1.75rem] border border-border/80 bg-surface/35 px-4 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Photo estimate
          </p>
          <h2 className="mt-2 font-serif text-[1.45rem] tracking-tight">
            Estimate from a photo
          </h2>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            Photos can’t weigh portions exactly. You’ll review the estimate
            before anything is saved.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void handleFile(file);
          event.target.value = "";
        }}
      />

      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="Meal preview"
          className="mt-4 max-h-56 w-full rounded-2xl object-cover"
        />
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
        >
          {busy ? "Estimating…" : previewUrl ? "Choose another photo" : "Take or choose photo"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground"
        >
          Back
        </button>
      </div>

      {note ? <p className="mt-3 text-[13px] text-muted">{note}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-muted">
          {error}
        </p>
      ) : null}
    </section>
  );
}
