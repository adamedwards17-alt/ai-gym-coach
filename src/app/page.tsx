import Link from "next/link";
import { appNavItems } from "@/lib/nav";

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-10 sm:px-6 sm:py-16">
      <section className="flex flex-col gap-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-accent">
          Personal training, in your pocket
        </p>
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-6xl">
          AI Gym Coach
        </h1>
        <p className="max-w-xl text-base leading-7 text-muted sm:text-lg">
          Get leaner, build muscle, and stay consistent with a coach that
          checks in on training, food, sleep, and how you feel — not just a
          tracker you have to remember to open.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/today"
            className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-6 text-sm font-semibold text-background"
          >
            View the app outline
          </Link>
          <Link
            href="/coach"
            className="inline-flex h-12 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold text-foreground"
          >
            Meet the coach
          </Link>
        </div>
      </section>

      <section aria-label="App sections">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-muted">
          What’s coming
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {appNavItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/50"
              >
                <p className="text-base font-semibold">{item.label}</p>
                <p className="mt-1 text-sm text-muted">Placeholder page</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
