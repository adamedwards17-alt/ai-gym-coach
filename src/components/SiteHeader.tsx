"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { CoachMark } from "@/components/CoachMark";
import { appNavItems } from "@/lib/nav";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 bg-background/55 backdrop-blur-xl">
      <div className="mx-auto flex h-[3.75rem] w-full max-w-6xl items-center justify-between px-6 sm:h-16 sm:px-10">
        <Link
          href={signedIn ? "/today" : "/"}
          className="flex items-center gap-2.5"
        >
          <CoachMark size="sm" />
          <span className="text-[14px] font-medium tracking-tight">
            AI Gym Coach
          </span>
        </Link>

        {signedIn ? (
          <div className="flex items-center gap-5">
            <nav
              className="hidden items-center gap-5 md:flex"
              aria-label="Main"
            >
              {appNavItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(`${item.href}/`));
                const isCoach = item.href === "/coach";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`flex items-center gap-1.5 text-[13px] transition-colors ${
                      isActive
                        ? "text-foreground"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    {isCoach ? <CoachMark size="dot" /> : null}
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <Link
              href="/profile"
              aria-label="Profile and goals"
              aria-current={
                pathname === "/profile" || pathname.startsWith("/profile/")
                  ? "page"
                  : undefined
              }
              className={`text-[13px] transition-colors ${
                pathname === "/profile" || pathname.startsWith("/profile/")
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Profile
            </Link>
            <SignOutButton />
          </div>
        ) : null}
      </div>
    </header>
  );
}
