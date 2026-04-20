import { useMemo } from 'react';
import { useUserStore } from '../../../../../stores/useUserStore';
import { ribbet } from '../../../../../coach/ribbet';

type HabitatFilter = 'habitats' | 'adventures';

interface GoalRoomHeaderProps {
  habitatFilter: Set<HabitatFilter>;
  onToggleFilter: (h: HabitatFilter) => void;
  onAdd: () => void;
}

export function GoalRoomHeader({ habitatFilter, onToggleFilter, onAdd }: GoalRoomHeaderProps) {
  const user = useUserStore((s) => s.user);
  const coachComment = useMemo(() => (user ? ribbet(user) : ''), [user]);

  return (
    <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 shrink-0">
          Goals
        </h2>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onToggleFilter('habitats')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              habitatFilter.has('habitats')
                ? 'bg-green-100 border-green-400 text-green-700 dark:bg-green-900/40 dark:border-green-600 dark:text-green-300'
                : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
            }`}
          >
            🏡 Habitat
          </button>
          <button
            type="button"
            onClick={() => onToggleFilter('adventures')}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              habitatFilter.has('adventures')
                ? 'bg-purple-100 border-purple-400 text-purple-700 dark:bg-purple-900/40 dark:border-purple-600 dark:text-purple-300'
                : 'border-gray-300 text-gray-400 dark:border-gray-600 dark:text-gray-500'
            }`}
          >
            ⚔️ Adventure
          </button>
        </div>

        {coachComment ? (
          <p className="flex-1 min-w-0 truncate text-xs text-gray-400 dark:text-gray-500 italic px-2">
            {coachComment}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 text-xs text-blue-500 font-medium whitespace-nowrap"
        >
          + Goal Hub
        </button>
      </div>
    </div>
  );
}
