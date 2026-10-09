import type { NutritionDaySummary } from "@/lib/nutrition";
import {
  buildMacroProgress,
  type MacroProgress,
  type ProgressTone,
} from "@/lib/nutrition-progress";

type NutritionProgressBarsProps = {
  summary: NutritionDaySummary;
  now?: Date;
  compact?: boolean;
};

const FILL_CLASS: Record<ProgressTone, string> = {
  normal: "bg-[#c9c6ea]/75",
  behind: "bg-[#c9a96a]/80",
  over: "bg-[#d9605b]",
};

const STATUS_TEXT_CLASS: Record<ProgressTone, string> = {
  normal: "text-muted",
  behind: "text-[#d2b57a]",
  over: "text-[#e5736f]",
};

function toneText(tone: ProgressTone): string | null {
  if (tone === "over") {
    return "Over target";
  }
  if (tone === "behind") {
    return "Behind pace";
  }
  return null;
}

function Row({ item, compact }: { item: MacroProgress; compact: boolean }) {
  const width = Math.min(Math.max(item.fillPercent, 0), 100);
  const tone = toneText(item.tone);
  const valueText = `${item.consumed.toLocaleString()} / ${item.target.toLocaleString()} ${item.unit}`;
  const status = item.statusLabel ?? tone;

  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={
            compact
              ? "text-[12px] text-foreground"
              : "text-[13px] text-foreground"
          }
        >
          {item.label}
        </span>
        <span
          className={
            compact ? "text-[12px] text-muted" : "text-[13px] text-muted"
          }
        >
          {valueText}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${item.label} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(item.fillPercent, 100)}
        aria-valuetext={`${valueText}${status ? `, ${status}` : ""}`}
        className={`mt-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${
          compact ? "h-1" : "h-1.5"
        }`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${FILL_CLASS[item.tone]}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {/* Status is always text, never colour alone. Compact mode hides the
          neutral "remaining" line but keeps over/behind warnings. */}
      {status && (!compact || item.tone !== "normal") ? (
        <p
          className={`mt-1 text-[12px] leading-4 ${STATUS_TEXT_CLASS[item.tone]}`}
        >
          {status}
        </p>
      ) : null}
    </li>
  );
}

export function NutritionProgressBars({
  summary,
  now,
  compact = false,
}: NutritionProgressBarsProps) {
  const progress = buildMacroProgress({ summary, now });

  if (!progress) {
    return null;
  }

  return (
    <ul
      aria-label="Today’s nutrition progress"
      className={compact ? "flex flex-col gap-2.5" : "flex flex-col gap-4"}
    >
      {progress.map((item) => (
        <Row key={item.id} item={item} compact={compact} />
      ))}
    </ul>
  );
}
