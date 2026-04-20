interface ScheduleRoomSubHeaderProps {
  filterValue: string;
  onFilterChange: (v: string) => void;
  onAddRoutine: () => void;
}

export function ScheduleRoomSubHeader({
  filterValue,
  onFilterChange,
  onAddRoutine,
}: ScheduleRoomSubHeaderProps) {
  return (
    <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
      <input
        type="text"
        value={filterValue}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder="Filter..."
        className="flex-1 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1 outline-none focus:border-indigo-300"
      />
      <button
        type="button"
        onClick={onAddRoutine}
        className="text-xs text-indigo-500 hover:text-indigo-700 font-medium shrink-0 whitespace-nowrap"
      >
        + Routine
      </button>
    </div>
  );
}
