type Option<T extends string> = {
  id: T;
  label: string;
};

type OptionSelectorProps<T extends string> = {
  name: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (id: T) => void;
};

export function OptionSelector<T extends string>({
  name,
  options,
  value,
  onChange,
}: OptionSelectorProps<T>) {
  return (
    <div
      className="today-reveal flex flex-wrap gap-2"
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
            className={`min-h-11 rounded-full border px-4 py-2.5 text-left text-[14px] transition-colors ${
              selected
                ? "border-white/20 bg-white/8 text-foreground"
                : "border-border bg-transparent text-muted hover:border-white/12 hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
