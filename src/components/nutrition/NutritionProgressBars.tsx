import type { NutritionDaySummary } from "@/lib/nutrition";
import {
  buildMacroProgress,
  type MacroProgress,
  type ProgressTone,
} from "@/lib/nutrition-progress";

type NutritionProgressBarsProps = {
  summary: NutritionDaySummary;
  now?: Date;
  /**
   * Shared Today/Nutrition layout: calorie headline + protein/carbs/fat row.
   * Prefer this for day summaries so both pages stay visually consistent.
   */
  compact?: boolean;
};

const FILL_CLASS: Record<ProgressTone, string> = {
  normal: "bg-[#c9c6ea]/80",
  behind: "bg-[#c9a96a]/85",
  over: "bg-[#d9605b]",
};

const STATUS_TEXT_CLASS: Record<ProgressTone, string> = {
  normal: "text-muted",
  behind: "text-[#d2b57a]",
  over: "text-[#e5736f]",
};

const TRACK = "bg-white/[0.07]";

function toneText(tone: ProgressTone): string | null {
  if (tone === "over") {
    return "Over target";
  }
  if (tone === "behind") {
    return "Behind pace";
  }
  return null;
}

function ProgressTrack({
  item,
  heightClass,
}: {
  item: MacroProgress;
  heightClass: string;
}) {
  const width = Math.min(Math.max(item.fillPercent, 0), 100);
  const status = item.statusLabel ?? toneText(item.tone);
  const valueText = `${item.consumed.toLocaleString()} / ${item.target.toLocaleString()} ${item.unit}`;

  return (
    <div
      role="progressbar"
      aria-label={`${item.label} progress`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(item.fillPercent, 100)}
      aria-valuetext={`${valueText}${status ? `, ${status}` : ""}`}
      className={`w-full overflow-hidden rounded-full ${TRACK} ${heightClass}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none ${FILL_CLASS[item.tone]}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function ListRow({ item, compact }: { item: MacroProgress; compact: boolean }) {
  const status = item.statusLabel ?? toneText(item.tone);
  const valueText = `${item.consumed.toLocaleString()} / ${item.target.toLocaleString()} ${item.unit}`;

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
      <div className="mt-1.5">
        <ProgressTrack item={item} heightClass={compact ? "h-1" : "h-1.5"} />
      </div>
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

function CompactMacroCell({ item }: { item: MacroProgress }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] px-2.5 py-2.5 sm:px-3">
      <p className="truncate text-[11px] text-muted">{item.label}</p>
      <p className="mt-0.5 truncate text-[13px] text-foreground">
        {item.consumed.toLocaleString()}
        <span className="text-muted">
          {" "}
          / {item.target.toLocaleString()}g
        </span>
      </p>
      <div className="mt-2">
        <ProgressTrack item={item} heightClass="h-1" />
      </div>
    </div>
  );
}

function CompactNutritionLayout({ progress }: { progress: MacroProgress[] }) {
  const calories = progress.find((item) => item.id === "calories");
  const macros = progress.filter(
    (item) =>
      item.id === "protein" || item.id === "carbs" || item.id === "fat",
  );

  if (!calories) {
    return null;
  }

  const calorieStatus = calories.statusLabel ?? toneText(calories.tone);

  return (
    <div aria-label="Nutrition progress" className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-transparent px-4 py-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Calories
            </p>
            <p className="mt-1 font-serif text-[1.85rem] leading-none tracking-tight text-foreground">
              {calories.consumed.toLocaleString()}
              <span className="ml-1 text-[0.95rem] text-muted">
                / {calories.target.toLocaleString()}
              </span>
            </p>
          </div>
          <p
            className={`pb-0.5 text-[12px] ${STATUS_TEXT_CLASS[calories.tone]}`}
          >
            {calorieStatus}
          </p>
        </div>
        <div className="mt-3">
          <ProgressTrack item={calories} heightClass="h-2" />
        </div>
      </div>

      {macros.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {macros.map((item) => (
            <CompactMacroCell key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </div>
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

  if (compact) {
    return <CompactNutritionLayout progress={progress} />;
  }

  return (
    <ul aria-label="Nutrition progress" className="flex flex-col gap-4">
      {progress.map((item) => (
        <ListRow key={item.id} item={item} compact={false} />
      ))}
    </ul>
  );
}
