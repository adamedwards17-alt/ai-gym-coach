type CoachMarkProps = {
  size?: "dot" | "sm" | "md";
};

const sizes = {
  dot: "h-1.5 w-1.5",
  sm: "h-7 w-7",
  md: "h-9 w-9",
};

export function CoachMark({ size = "sm" }: CoachMarkProps) {
  return (
    <span
      className={`coach-gradient inline-flex shrink-0 items-center justify-center rounded-full ${sizes[size]}`}
      aria-hidden
    >
      {size !== "dot" ? (
        <span className="h-[38%] w-[38%] rounded-full bg-background/85" />
      ) : null}
    </span>
  );
}
