type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        Coming next
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      <p className="max-w-xl text-base leading-7 text-muted">{description}</p>
      <div className="mt-4 rounded-2xl border border-border bg-surface px-5 py-8 text-sm leading-6 text-muted">
        This screen is a placeholder so we can grow the app one piece at a
        time. Nothing is saved here yet.
      </div>
    </section>
  );
}
