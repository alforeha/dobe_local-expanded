interface TrophyShortcutProps {
  onClick: () => void;
}

export function TrophyShortcut({ onClick }: TrophyShortcutProps) {
  return (
    <button
      type="button"
      className="flex flex-col items-center gap-1 text-yellow-500 hover:text-yellow-600"
      onClick={onClick}
      aria-label="Badges"
    >
      <span className="text-2xl">🏅</span>
      <span className="text-xs text-gray-500">Badges</span>
    </button>
  );
}
