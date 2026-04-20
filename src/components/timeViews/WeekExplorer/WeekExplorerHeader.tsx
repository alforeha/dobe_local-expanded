interface WeekExplorerHeaderProps {
  seedDate: Date;
  windowStart: Date;
  windowEnd: Date;
  onSeedChange: (d: Date) => void;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatExplorerDate(date: Date): string {
  return `${date.getFullYear()}-${MONTH_NAMES[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatSeedValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function WeekExplorerHeader({ seedDate, windowStart, windowEnd, onSeedChange }: WeekExplorerHeaderProps) {
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const d = new Date(`${e.target.value}T00:00:00`);
    if (!Number.isNaN(d.getTime())) onSeedChange(d);
  };

  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900">
      <div className="min-w-0">
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100">57-Week Explorer</div>
        <label className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Seed:</span>
          <input
            type="date"
            value={formatSeedValue(seedDate)}
            onChange={handleInput}
            className="border-b border-gray-300 bg-transparent text-xs text-gray-700 focus:outline-none dark:border-gray-600 dark:text-gray-300"
          />
        </label>
      </div>

      <div className="text-right text-xs text-gray-500 dark:text-gray-400">
        <div>-13w {'->'} {formatExplorerDate(windowStart)}</div>
        <div>+44w {'->'} {formatExplorerDate(windowEnd)}</div>
      </div>
    </div>
  );
}
