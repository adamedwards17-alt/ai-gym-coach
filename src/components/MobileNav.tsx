"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CoachMark } from "@/components/CoachMark";
import { appNavItems } from "@/lib/nav";

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  if (!signedIn) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/75 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="App"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {appNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          const isCoach = item.href === "/coach";

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[3.75rem] flex-col items-center justify-center gap-1 text-[10px] ${
                  isActive ? "text-foreground" : "text-muted"
                }`}
              >
                {isCoach ? (
                  <CoachMark size="dot" />
                ) : (
                  <span
                    className={`h-1 w-1 rounded-full ${
                      isActive ? "bg-foreground" : "bg-transparent"
                    }`}
                    aria-hidden
                  />
                )}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
