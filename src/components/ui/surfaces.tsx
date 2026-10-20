import type { ReactNode } from "react";

export const cardClass = "rounded-2xl border border-border bg-surface";

export const pageShellClass =
  "mx-auto w-full max-w-md px-5 pb-28 pt-8 sm:max-w-lg sm:px-6 sm:pb-16 sm:pt-12";

export function PageHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[1.85rem]">
          {title}
        </h1>
        {detail ? (
          <p className="mt-1 text-[14px] leading-6 text-muted">{detail}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pt-1">{action}</div> : null}
    </header>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold text-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`${cardClass} p-4 ${className}`}>
      {children}
    </section>
  );
}

export function MetricValue({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-[1.65rem] font-semibold leading-none tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      {detail ? <p className="mt-1 text-[13px] text-muted">{detail}</p> : null}
    </div>
  );
}

const badgeTone = {
  neutral: "bg-background text-muted",
  open: "bg-primary/10 text-primary",
  done: "bg-success/15 text-success-text",
  warn: "bg-[#c9892d]/15 text-[#8a5a12]",
} as const;

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeTone[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-[14px] leading-6 text-muted">{children}</p>;
}
