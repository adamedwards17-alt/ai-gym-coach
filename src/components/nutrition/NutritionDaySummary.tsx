import type { NutritionDaySummary } from "@/lib/nutrition";

type NutritionDaySummaryCardProps = {
  summary: NutritionDaySummary;
};

export function NutritionDaySummaryCard({
  summary,
}: NutritionDaySummaryCardProps) {
  if (summary.targetsStatus !== "ok" || !summary.targets) {
    return (
      <section className="mb-6">
        <p className="text-[13px] leading-6 text-muted">
          {summary.targetsMessage ??
            "Complete your profile to unlock calorie and macro targets."}
        </p>
      </section>
    );
  }

  const { targets, consumed, remaining } = summary;

  return (
    <section className="mb-6">
      <p className="text-[17px] leading-6 tracking-tight text-foreground">
        {consumed.calories.toLocaleString()}
        <span className="text-muted">
          {" "}
          / {targets.daily_calories.toLocaleString()} kcal
        </span>
      </p>
      <p className="mt-1 text-[13px] text-muted">
        {remaining.calories < 0
          ? `${Math.abs(remaining.calories).toLocaleString()} kcal over`
          : `${remaining.calories.toLocaleString()} kcal remaining`}
      </p>
      <p className="mt-2 text-[13px] leading-5 text-muted">
        Protein {consumed.proteinG} / {targets.protein_g}g · Carbs{" "}
        {consumed.carbsG} / {targets.carbs_g}g · Fat {consumed.fatG} /{" "}
        {targets.fat_g}g
      </p>
    </section>
  );
}
