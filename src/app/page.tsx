import Link from "next/link";
import { CoachMark } from "@/components/CoachMark";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center sm:min-h-[calc(100dvh-6.5rem)]">
      <CoachMark size="md" />
      <h1 className="mt-8 font-serif text-5xl leading-none tracking-tight sm:text-7xl">
        <span className="coach-text">AI Gym Coach</span>
      </h1>
      <p className="mt-7 max-w-md text-base leading-8 text-muted sm:text-lg sm:leading-8">
        A private trainer in your pocket. It helps you get leaner, build
        muscle, and stay consistent — by noticing training, food, sleep, and
        how you feel.
      </p>
      <Link
        href="/coach"
        className="mt-10 inline-flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Meet your coach
      </Link>
    </div>
  );
}
