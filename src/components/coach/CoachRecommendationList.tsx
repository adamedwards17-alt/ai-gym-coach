import { cardClass } from "@/components/ui/surfaces";
import type { CoachRecommendationList as RecommendationList } from "@/lib/coach-recommendations";

export function CoachRecommendationList({
  list,
}: {
  list: RecommendationList;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {list.lead ? (
        <p className="whitespace-pre-line text-[15px] leading-6 text-foreground">
          {list.lead}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {list.items.map((item) => (
          <li key={item.title} className={`${cardClass} px-3.5 py-3`}>
            <p className="text-[15px] font-semibold text-foreground">{item.title}</p>
            {item.detail ? (
              <p className="mt-1 text-[13px] leading-5 text-muted">{item.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {list.closing ? (
        <p className="whitespace-pre-line text-[15px] leading-6 text-foreground">
          {list.closing}
        </p>
      ) : null}
    </div>
  );
}
