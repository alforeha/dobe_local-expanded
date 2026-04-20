import { resolveIcon } from '../../../../../constants/iconMap';

interface StatGroupBottomBarProps {
  talentPoints: number;
  onTalentTree: () => void;
}

export function StatGroupBottomBar({ talentPoints, onTalentTree }: StatGroupBottomBarProps) {
  return (
    <div className="shrink-0 flex items-center justify-between border-t border-gray-100 dark:border-gray-700 px-4 py-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        <span className="font-bold text-indigo-600 dark:text-indigo-400">{talentPoints}</span> talent point{talentPoints !== 1 ? 's' : ''} available
      </p>
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
        onClick={onTalentTree}
        aria-label="Open talent tree"
      >
        {resolveIcon('star')}
      </button>
    </div>
  );
}
