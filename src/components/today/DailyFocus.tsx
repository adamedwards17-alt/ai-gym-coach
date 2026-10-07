type DailyFocusProps = {
  items: string[];
};

export function DailyFocus({ items }: DailyFocusProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="today-reveal pl-10">
      <h2 className="text-[13px] font-medium tracking-tight text-muted">
        Today’s focus
      </h2>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-baseline gap-3 text-[15px] leading-6 text-foreground/90"
          >
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
