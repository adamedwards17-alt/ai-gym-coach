"use client";

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 pb-8 pt-16 sm:items-center sm:pb-4">
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
        className="relative w-full max-w-sm rounded-[1.75rem] border border-border bg-background p-5 shadow-[0_24px_80px_rgb(0_0_0/0.45)]"
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
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:opacity-60"
            onClick={onConfirm}
          >
            {pending ? "Removing…" : confirmLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm text-foreground disabled:opacity-60"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
