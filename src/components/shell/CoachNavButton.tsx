interface CoachNavButtonProps {
  onOpen: () => void;
}

export function CoachNavButton({ onOpen }: CoachNavButtonProps) {
  return (
    <button
      type="button"
      aria-label="Open coach"
      onClick={onOpen}
      className="flex h-full w-full items-center justify-center text-xl bg-green-50 dark:bg-green-950/30 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
    >
      🐸
    </button>
  );
}
