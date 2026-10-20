import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 text-[15px] text-foreground outline-none placeholder:text-muted focus:border-primary";

export function TextField({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={`${fieldClass} h-11 ${className}`} {...props} />
  );
}

export function TextArea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${fieldClass} min-h-24 py-3 ${className}`}
      {...props}
    />
  );
}
