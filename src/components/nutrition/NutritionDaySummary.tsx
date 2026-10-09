import { NutritionProgressBars } from "@/components/nutrition/NutritionProgressBars";
import type { NutritionDaySummary } from "@/lib/nutrition";

type NutritionDaySummaryCardProps = {
  summary: NutritionDaySummary;
  now?: Date;
};

export function NutritionDaySummaryCard({
  summary,
  now,
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

  return (
    <section className="mb-6">
      <NutritionProgressBars summary={summary} now={now} />
    </section>
  );
}
