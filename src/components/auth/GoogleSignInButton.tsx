"use client";

import { useFormStatus } from "react-dom";
import { signInWithGoogle } from "@/lib/auth/actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 w-full max-w-xs items-center justify-center gap-2.5 rounded-full bg-foreground px-8 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? (
        "Connecting…"
      ) : (
        <>
          <GoogleMark />
          {label}
        </>
      )}
    </button>
  );
}

export function GoogleSignInButton({
  label = "Continue with Google",
}: {
  label?: string;
}) {
  return (
    <form action={signInWithGoogle} className="flex w-full justify-center">
      <SubmitButton label={label} />
    </form>
  );
}

function GoogleMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="currentColor"
    >
      <path d="M21.6 12.23c0-.74-.07-1.45-.19-2.13H12v4.03h5.4a4.62 4.62 0 0 1-2 3.03v2.51h3.23c1.89-1.74 2.97-4.3 2.97-7.44Z" />
      <path d="M12 22c2.7 0 4.96-.9 6.62-2.33l-3.23-2.51c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A9.99 9.99 0 0 0 12 22Z" />
      <path d="M6.41 13.99A6 6 0 0 1 6.1 12c0-.69.12-1.36.31-1.99V7.42H3.07A9.99 9.99 0 0 0 2 12c0 1.61.39 3.14 1.07 4.58l3.34-2.59Z" />
      <path d="M12 5.88c1.47 0 2.79.5 3.82 1.5l2.87-2.87C16.95 2.9 14.7 2 12 2A9.99 9.99 0 0 0 3.07 7.42l3.34 2.59C7.2 7.64 9.4 5.88 12 5.88Z" />
    </svg>
  );
}
