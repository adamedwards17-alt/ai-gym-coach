"use client";

import type { ReactNode } from "react";

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/85 transition-colors hover:bg-primary/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {children}
    </button>
  );
}

/** Vertical-bar barcode glyph (not a hashtag). */
export function BarcodeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M3 5v14M6.5 5v14M9 5v14M11 5v14M14.5 5v14M17 5v14M21 5v14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Camera glyph for photo food estimation. */
export function CameraIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2.1l1.2-1.6A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.2.6L15.4 6h2.1A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12.5"
        r="3.25"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function MealBarcodeButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Scan barcode" onClick={onClick}>
      <BarcodeIcon />
    </IconButton>
  );
}

export function MealCameraButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Estimate from photo" onClick={onClick}>
      <CameraIcon />
    </IconButton>
  );
}
