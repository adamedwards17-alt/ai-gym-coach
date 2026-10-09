import type { NutritionDaySummary } from "@/lib/nutrition";
import {
  buildMacroProgress,
  type MacroProgress,
  type ProgressTone,
} from "@/lib/nutrition-progress";

type NutritionProgressBarsProps = {
  summary: NutritionDaySummary;
  now?: Date;
  /** Compact Today layout: calories headline + protein + mini carbs/fat. */
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

function CompactTodayLayout({ progress }: { progress: MacroProgress[] }) {
  const calories = progress.find((item) => item.id === "calories");
  const protein = progress.find((item) => item.id === "protein");
  const carbs = progress.find((item) => item.id === "carbs");
  const fat = progress.find((item) => item.id === "fat");

  if (!calories || !protein) {
    return null;
  }

  const calorieStatus = calories.statusLabel ?? toneText(calories.tone);
  const proteinStatus = protein.statusLabel ?? toneText(protein.tone);

  return (
    <div aria-label="Today’s nutrition progress" className="flex flex-col gap-4">
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

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-medium text-foreground">Protein</p>
          <p className="text-[13px] text-muted">
            {protein.consumed.toLocaleString()} /{" "}
            {protein.target.toLocaleString()} g
          </p>
        </div>
        <div className="mt-2">
          <ProgressTrack item={protein} heightClass="h-1.5" />
        </div>
        {proteinStatus ? (
          <p className={`mt-1.5 text-[12px] ${STATUS_TEXT_CLASS[protein.tone]}`}>
            {proteinStatus}
          </p>
        ) : (
          <p className="mt-1.5 text-[12px] text-muted">
            {Math.max(0, protein.remaining).toLocaleString()}g remaining
          </p>
        )}
      </div>

      {(carbs || fat) && (
        <div className="grid grid-cols-2 gap-3">
          {carbs ? (
            <div className="rounded-xl border border-white/[0.06] px-3 py-2.5">
              <p className="text-[11px] text-muted">Carbs</p>
              <p className="mt-0.5 text-[13px] text-foreground">
                {carbs.consumed.toLocaleString()}
                <span className="text-muted">
                  {" "}
                  / {carbs.target.toLocaleString()}g
                </span>
              </p>
              <div className="mt-2">
                <ProgressTrack item={carbs} heightClass="h-1" />
              </div>
            </div>
          ) : null}
          {fat ? (
            <div className="rounded-xl border border-white/[0.06] px-3 py-2.5">
              <p className="text-[11px] text-muted">Fat</p>
              <p className="mt-0.5 text-[13px] text-foreground">
                {fat.consumed.toLocaleString()}
                <span className="text-muted">
                  {" "}
                  / {fat.target.toLocaleString()}g
                </span>
              </p>
              <div className="mt-2">
                <ProgressTrack item={fat} heightClass="h-1" />
              </div>
            </div>
          ) : null}
        </div>
      )}
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
    return <CompactTodayLayout progress={progress} />;
  }

  return (
    <ul
      aria-label="Today’s nutrition progress"
      className="flex flex-col gap-4"
    >
      {progress.map((item) => (
        <ListRow key={item.id} item={item} compact={false} />
      ))}
    </ul>
  );
}
