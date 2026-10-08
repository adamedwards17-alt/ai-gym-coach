"use client";

import { useFormStatus } from "react-dom";
import { signOut } from "@/lib/auth/actions";

function Submit() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="text-[13px] text-muted transition-colors hover:text-foreground disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <Submit />
    </form>
  );
}
