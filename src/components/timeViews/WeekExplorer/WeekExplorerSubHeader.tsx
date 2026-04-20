import { useSystemStore } from '../../../stores/useSystemStore';

const ALL_DAYS = ['M', 'T', 'W', 'TH', 'F', 'S', 'SU'];

/** Fixed sub-header showing day-of-week labels for the explorer grid. */
export function WeekExplorerSubHeader() {
  const visibleDays = useSystemStore((s) => s.settings?.timePreferences?.explorerView?.visibleDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const days = ALL_DAYS.filter((_, i) => visibleDays.includes(i));

  return (
    <div className="flex shrink-0 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1">
      {days.map((d, i) => (
        <div key={i} className="flex-1 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">
          {d}
        </div>
      ))}
    </div>
  );
}
