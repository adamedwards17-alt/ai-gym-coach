"use client";

import Link from "next/link";
import { buttonClassName } from "@/components/ui/Button";
import type { TodayActionBanner } from "@/lib/today-action-banners";

type TodayActionBannersProps = {
  banners: TodayActionBanner[];
  onDismiss: (bannerId: string) => void;
  onOpenCheckIn: () => void;
  onHabitLog?: (banner: TodayActionBanner) => void;
};

export function TodayActionBanners({
  banners,
  onDismiss,
  onOpenCheckIn,
  onHabitLog,
}: TodayActionBannersProps) {
  if (banners.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Suggested actions"
      className="today-reveal mb-6 flex flex-col gap-2.5"
    >
      {banners.map((banner) => (
        <article
          key={banner.id}
          className="relative rounded-xl border border-border bg-surface px-3.5 py-3"
        >
          <div className="flex items-start gap-3 pr-7">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-medium leading-5 text-foreground">
                {banner.title}
              </p>
              {banner.description ? (
                <p className="mt-0.5 text-[12px] leading-4 text-muted">
                  {banner.description}
                </p>
              ) : null}
              <div className="mt-2">
                {banner.opensCheckIn ? (
                  <button
                    type="button"
                    onClick={onOpenCheckIn}
                    className={buttonClassName("secondary", "mt-2 h-9 px-3 text-[13px]")}
                  >
                    {banner.actionLabel}
                  </button>
                ) : banner.kind === "habit" && onHabitLog ? (
                  <button
                    type="button"
                    onClick={() => onHabitLog(banner)}
                    className={buttonClassName("secondary", "mt-2 h-9 px-3 text-[13px]")}
                  >
                    {banner.actionLabel}
                  </button>
                ) : banner.href ? (
                  <Link
                    href={banner.href}
                    className={buttonClassName("secondary", "mt-2 h-9 px-3 text-[13px]")}
                  >
                    {banner.actionLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label={`Dismiss: ${banner.title}`}
            onClick={() => onDismiss(banner.id)}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-primary/5 hover:text-foreground"
          >
            <span aria-hidden className="text-[16px] leading-none">
              ×
            </span>
          </button>
        </article>
      ))}
    </section>
  );
}
