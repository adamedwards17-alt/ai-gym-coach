type UserResponseProps = {
  label: string;
  onEdit: () => void;
};

export function UserResponse({ label, onEdit }: UserResponseProps) {
  return (
    <div className="today-reveal flex scroll-mt-24 justify-end">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Change answer: ${label}`}
        className="max-w-[85%] rounded-2xl rounded-br-md border border-border bg-white/8 px-4 py-2.5 text-left text-[14px] text-foreground transition-colors hover:bg-white/12"
      >
        {label}
      </button>
    </div>
  );
}
