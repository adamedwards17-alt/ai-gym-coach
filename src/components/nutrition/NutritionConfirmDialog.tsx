"use client";

import { Button } from "@/components/ui/Button";

type NutritionConfirmDialogProps = {
  title: string;
  body: string;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function NutritionConfirmDialog({
  title,
  body,
  confirmLabel,
  pending = false,
  onCancel,
  onConfirm,
}: NutritionConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#242B33]/40 px-4 pb-8 pt-16 sm:items-center sm:pb-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="nutrition-confirm-title"
        aria-describedby="nutrition-confirm-body"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-[0_16px_40px_rgb(36_43_51/0.12)]"
      >
        <p
          id="nutrition-confirm-title"
          className="font-serif text-[1.4rem] tracking-tight"
        >
          {title}
        </p>
        <p
          id="nutrition-confirm-body"
          className="mt-2 text-[14px] leading-6 text-muted"
        >
          {body}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="danger" disabled={pending} onClick={onConfirm}>
            {pending ? "Removing…" : confirmLabel}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
