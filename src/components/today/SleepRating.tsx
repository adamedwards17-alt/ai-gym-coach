import type { SleepScore } from "@/lib/today";

const scores: SleepScore[] = [1, 2, 3, 4, 5];

type SleepRatingProps = {
  value: SleepScore | null;
  onChange: (score: SleepScore) => void;
};

export function SleepRating({ value, onChange }: SleepRatingProps) {
  return (
    <div className="today-reveal">
      <div
        className="flex items-center gap-2"
        role="radiogroup"
        aria-label="Sleep quality from 1 restless to 5 great"
      >
        {scores.map((score) => {
          const selected = value === score;

          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${score} out of 5`}
              onClick={() => onChange(score)}
              className={`flex h-12 min-w-0 flex-1 items-center justify-center rounded-2xl border text-[15px] font-medium transition-colors ${
                selected
                  ? "border-white/20 bg-white/10 text-foreground"
                  : "border-border text-muted hover:border-white/12 hover:text-foreground"
              }`}
            >
              {score}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted">
        <span>Restless</span>
        <span>Great</span>
      </div>
    </div>
  );
}
