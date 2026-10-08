import type { NutritionDaySummary } from "@/lib/nutrition";

function formatSigned(value: number, unit: string): string {
  if (value < 0) {
    return `${Math.abs(value)}${unit} over`;
  }
  return `${value}${unit} remaining`;
}

function ProgressBar({
  consumed,
  target,
}: {
  consumed: number;
  target: number;
}) {
  const ratio =
    target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;

  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full bg-foreground/80 transition-[width]"
        style={{ width: `${ratio}%` }}
      />
    </div>
  );
}

type NutritionDaySummaryCardProps = {
  summary: NutritionDaySummary;
};

export function NutritionDaySummaryCard({
  summary,
}: NutritionDaySummaryCardProps) {
  if (summary.targetsStatus !== "ok" || !summary.targets) {
    return (
      <section className="mb-8 rounded-3xl border border-border/70 bg-surface/40 px-5 py-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          Today
        </p>
        <p className="mt-3 text-[15px] leading-7 text-muted">
          {summary.targetsMessage ??
            "Complete your profile to unlock calorie and macro targets."}
        </p>
      </section>
    );
  }

  const { targets, consumed, remaining } = summary;

  return (
    <section className="mb-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
        Today
      </p>

      <div className="mt-5">
        <p className="text-[13px] text-muted">Calories</p>
        <p className="mt-1 font-serif text-[2rem] leading-none tracking-tight">
          {consumed.calories.toLocaleString()}
          <span className="text-[1.1rem] text-muted">
            {" "}
            / {targets.daily_calories.toLocaleString()} kcal
          </span>
        </p>
        <p className="mt-2 text-[13px] text-muted">
          {formatSigned(remaining.calories, " kcal")}
        </p>
        <ProgressBar
          consumed={consumed.calories}
          target={targets.daily_calories}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(
          [
            {
              label: "Protein",
              consumed: consumed.proteinG,
              target: targets.protein_g,
              remaining: remaining.proteinG,
              unit: "g",
            },
            {
              label: "Carbs",
              consumed: consumed.carbsG,
              target: targets.carbs_g,
              remaining: remaining.carbsG,
              unit: "g",
            },
            {
              label: "Fat",
              consumed: consumed.fatG,
              target: targets.fat_g,
              remaining: remaining.fatG,
              unit: "g",
            },
          ] as const
        ).map((macro) => (
          <div key={macro.label} className="min-w-0">
            <p className="text-[13px] text-muted">{macro.label}</p>
            <p className="mt-1 text-[16px] text-foreground">
              {macro.consumed}
              <span className="text-muted">
                {" "}
                / {macro.target}
                {macro.unit}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {formatSigned(macro.remaining, macro.unit)}
            </p>
            <ProgressBar consumed={macro.consumed} target={macro.target} />
          </div>
        ))}
      </div>

      <p className="mt-5 text-[12px] leading-5 text-muted">
        Targets are estimates from your profile. Food numbers are AI estimates.
      </p>
    </section>
  );
}
