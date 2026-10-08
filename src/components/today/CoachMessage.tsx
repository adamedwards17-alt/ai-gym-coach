import { CoachMark } from "@/components/CoachMark";

type CoachMessageProps = {
  id?: string;
  children: string;
  footnote?: string;
};

export function CoachMessage({ id, children, footnote }: CoachMessageProps) {
  return (
    <div id={id} className="today-reveal flex scroll-mt-8 gap-3">
      <CoachMark size="sm" />
      <div className="min-w-0 pt-0.5">
        <p className="whitespace-pre-line text-[15px] leading-7 text-foreground/92">
          {children}
        </p>
        {footnote ? (
          <p className="mt-2 text-[11px] leading-5 text-muted">{footnote}</p>
        ) : null}
      </div>
    </div>
  );
}
