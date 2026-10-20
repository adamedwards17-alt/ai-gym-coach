type CompactProgressBarProps = {
  label: string;
  valueText: string;
  fillPercent: number;
  statusLabel?: string | null;
  /** Achieved / on-track vs not yet there — text always accompanies colour. */
  tone?: "normal" | "achieved" | "over";
  compact?: boolean;
};

const FILL_CLASS = {
  normal: "bg-primary-bright",
  achieved: "bg-success",
  over: "bg-danger",
} as const;

const STATUS_CLASS = {
  normal: "text-muted",
  achieved: "text-success-text",
  over: "text-danger-text",
} as const;

export function CompactProgressBar({
  label,
  valueText,
  fillPercent,
  statusLabel = null,
  tone = "normal",
  compact = false,
}: CompactProgressBarProps) {
  const width = Math.min(Math.max(fillPercent, 0), 100);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={
            compact ? "text-[12px] text-foreground" : "text-[13px] text-foreground"
          }
        >
          {label}
        </span>
        <span
          className={compact ? "text-[12px] text-muted" : "text-[13px] text-muted"}
        >
          {valueText}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(fillPercent, 100)}
        aria-valuetext={`${valueText}${statusLabel ? `, ${statusLabel}` : ""}`}
        className={`mt-1.5 w-full overflow-hidden rounded-full bg-border ${
          compact ? "h-1" : "h-1.5"
        }`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${FILL_CLASS[tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {statusLabel ? (
        <p className={`mt-1 text-[12px] leading-4 ${STATUS_CLASS[tone]}`}>
          {statusLabel}
        </p>
      ) : null}
    </div>
  );
}
