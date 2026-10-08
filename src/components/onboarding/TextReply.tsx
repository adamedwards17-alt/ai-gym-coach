"use client";

import { useState } from "react";

type TextReplyProps = {
  label: string;
  placeholder?: string;
  initialValue?: string;
  multiline?: boolean;
  skipLabel?: string;
  onSubmit: (value: string) => void;
};

export function TextReply({
  label,
  placeholder,
  initialValue = "",
  multiline = false,
  skipLabel,
  onSubmit,
}: TextReplyProps) {
  const [value, setValue] = useState(initialValue);

  function submit(next: string) {
    const trimmed = next.trim();
    if (!trimmed && !skipLabel) {
      return;
    }
    onSubmit(trimmed || skipLabel || "");
  }

  return (
    <form
      className="today-reveal"
      onSubmit={(event) => {
        event.preventDefault();
        submit(value);
      }}
    >
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none rounded-2xl border border-border bg-surface/60 px-4 py-3 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted focus:border-white/20"
          onChange={(event) => setValue(event.target.value)}
        />
      ) : (
        <input
          aria-label={label}
          value={value}
          placeholder={placeholder}
          autoComplete="name"
          className="h-12 w-full rounded-full border border-border bg-surface/60 px-4 text-[15px] text-foreground outline-none placeholder:text-muted focus:border-white/20"
          onChange={(event) => setValue(event.target.value)}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
        >
          Continue
        </button>
        {skipLabel ? (
          <button
            type="button"
            className="text-sm text-muted hover:text-foreground"
            onClick={() => submit(skipLabel)}
          >
            {skipLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
