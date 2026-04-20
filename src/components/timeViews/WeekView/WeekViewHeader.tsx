import { addDays } from '../../../utils/dateUtils';
import { useAppDate } from '../../../utils/useAppDate';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface WeekViewHeaderProps {
  weekStart: Date;
  onBack: () => void;
  onForward: () => void;
}

function formatHeaderDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]} ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

function weeksBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (7 * 86_400_000));
}

function relativeWeekLabel(appDate: Date, weekStart: Date): string {
  const diff = weeksBetween(appDate, weekStart);
  if (diff === 0) return 'This week';
  return diff < 0 ? `${Math.abs(diff)} weeks ago` : `${diff} weeks away`;
}

export function WeekViewHeader({ weekStart, onBack, onForward }: WeekViewHeaderProps) {
  const appDate = useAppDate();
  const currentWeekStart = addDays(appDate, -(appDate.getDay() === 0 ? 6 : appDate.getDay() - 1));
  const weekEnd = addDays(weekStart, 6);
  const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

  return (
    <div className={`flex shrink-0 items-stretch border-b ${isCurrentWeek ? 'border-purple-200 bg-purple-50 dark:border-purple-700/60 dark:bg-purple-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}`}>
      <button
        type="button"
        aria-label="Previous week"
        onClick={onBack}
        className={`flex w-[15%] items-center justify-center rounded-l-full text-xl transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${isCurrentWeek ? 'text-purple-500 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}
      >
        {'<'}
      </button>

      <div className="min-w-0 flex-1 py-2 text-center">
        <div className={`text-sm font-semibold ${isCurrentWeek ? 'text-purple-700 dark:text-purple-300' : 'text-gray-800 dark:text-gray-100'}`}>
          {formatHeaderDate(weekStart)} {'->'} {formatHeaderDate(weekEnd)}
        </div>
        <div className={`text-xs ${isCurrentWeek ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}>{relativeWeekLabel(currentWeekStart, weekStart)}</div>
      </div>

      <button
        type="button"
        aria-label="Next week"
        onClick={onForward}
        className={`flex w-[15%] items-center justify-center rounded-r-full text-xl transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${isCurrentWeek ? 'text-purple-500 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}`}
      >
        {'>'}
      </button>
    </div>
  );
}
