import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary/90 disabled:opacity-50",
  secondary:
    "border border-border bg-surface text-foreground hover:border-primary/40 disabled:opacity-50",
  danger:
    "bg-danger-text text-white hover:bg-danger-text/90 disabled:opacity-50",
  ghost:
    "text-muted hover:bg-primary/5 hover:text-foreground disabled:opacity-50",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  extra = "",
) {
  return `inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-colors ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName(variant, className)}
      {...props}
    />
  );
}
