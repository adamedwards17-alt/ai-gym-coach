type Option<T extends string | number> = {
  id: T;
  label: string;
  description?: string;
};

type OptionSelectorProps<T extends string | number> = {
  name: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (id: T) => void;
};

export function OptionSelector<T extends string | number>({
  name,
  options,
  value,
  onChange,
}: OptionSelectorProps<T>) {
  const hasDescriptions = options.some((option) => !!option.description);

  return (
    <div
      className={
        hasDescriptions
          ? "today-reveal flex flex-col gap-2"
          : "today-reveal flex flex-wrap gap-2"
      }
      role="radiogroup"
      aria-label={name}
    >
      {options.map((option) => {
        const selected = option.id === value;

        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={
              hasDescriptions
                ? `min-h-11 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-transparent text-muted hover:border-primary/30 hover:text-foreground"
                  }`
                : `min-h-11 rounded-full border px-4 py-2.5 text-left text-[14px] transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-transparent text-muted hover:border-primary/30 hover:text-foreground"
                  }`
            }
          >
            <span className={hasDescriptions ? "block text-[14px]" : undefined}>
              {option.label}
            </span>
            {option.description ? (
              <span className="mt-1 block text-[12px] leading-5 text-muted">
                {option.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
