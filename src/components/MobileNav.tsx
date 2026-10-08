"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CoachIcon,
  NutritionIcon,
  ProgressIcon,
  TodayIcon,
  TrainIcon,
} from "@/components/nav/NavIcons";
import { appNavItems } from "@/lib/nav";

const navIcons = {
  "/today": TodayIcon,
  "/train": TrainIcon,
  "/nutrition": NutritionIcon,
  "/progress": ProgressIcon,
  "/coach": CoachIcon,
} as const;

export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();

  if (!signedIn) {
    return null;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/92 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl md:hidden"
      aria-label="App"
    >
      <ul className="mx-auto grid h-[4.25rem] max-w-lg grid-cols-5 px-1">
        {appNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(`${item.href}/`));
          const Icon = navIcons[item.href as keyof typeof navIcons];

          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-full min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl px-1 transition-colors ${
                  isActive
                    ? "text-foreground"
                    : "text-muted active:text-foreground/80"
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                    isActive ? "bg-white/[0.1]" : "bg-transparent"
                  }`}
                >
                  {Icon ? (
                    <Icon
                      className={`h-[22px] w-[22px] ${
                        isActive ? "opacity-100" : "opacity-80"
                      }`}
                      active={isActive}
                    />
                  ) : null}
                </span>
                <span
                  className={`max-w-full truncate text-[13px] leading-none tracking-[-0.01em] ${
                    isActive ? "font-semibold" : "font-medium"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
