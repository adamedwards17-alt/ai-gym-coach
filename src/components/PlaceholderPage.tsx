type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-8.5rem)] w-full max-w-lg flex-col justify-center px-6 py-16 text-center sm:min-h-[calc(100dvh-6.5rem)]">
      <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">{title}</h1>
      <p className="mx-auto mt-5 max-w-sm text-[16px] leading-8 text-muted">
        {description}
      </p>
      <p className="mx-auto mt-10 max-w-xs text-sm leading-6 text-muted/70">
        This space is ready. Nothing lives here yet.
      </p>
    </section>
  );
}
