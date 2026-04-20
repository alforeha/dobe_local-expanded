interface BackpackShortcutProps {
  onClick: () => void;
}

export function BackpackShortcut({ onClick }: BackpackShortcutProps) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1 text-brown-500 hover:text-brown-600"
      onClick={onClick}
      aria-label="Equipment"
    >
      <span className="text-2xl">🎒</span>
      <span className="text-xs text-gray-500">Equipment</span>
    </button>
  );
}
