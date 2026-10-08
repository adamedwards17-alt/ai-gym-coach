type IconProps = {
  className?: string;
  active?: boolean;
};

export function TodayIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M3.5 9.5h17M8 3.5v3M16 3.5v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M8.5 13.5h2v2h-2zM11.5 13.5h2v2h-2zM14.5 13.5h2v2h-2z"
        fill="currentColor"
      />
    </svg>
  );
}

export function TrainIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M7 9.5h10M7 14.5h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M4.5 8v8M19.5 8v8"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M2.75 9.5v5M21.25 9.5v5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NutritionIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M12 20.5c4.2-1.2 7-4.4 7-8.6 0-2.4-1.1-4.2-2.7-5.3-.7 2.6-2.2 4.3-4.3 5.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 20.5c-4.2-1.2-7-4.4-7-8.6 0-3.8 2.4-6.5 5.5-7.4.2 3.2 1.4 5.5 3.5 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 4.5v5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProgressIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M4.5 18.5V14M10 18.5V9.5M15.5 18.5v-6M20.5 18.5V6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M3.5 19.5h17"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CoachIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M5.5 16.5 4 20l3.7-1.4c.9.4 1.9.6 3 .6 4.4 0 8-2.9 8-6.6S15.1 5.5 10.7 5.5 2.7 8.4 2.7 12.1c0 1.7.8 3.2 2.1 4.4Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M14.8 8.2c1.1.4 2 1 2.7 1.8 1.3 1.2 2.1 2.7 2.1 4.4 0 1.4-.6 2.7-1.6 3.7L19.5 20l-2.2-1.1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
