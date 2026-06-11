import { IconDisplay } from '../../../../shared/IconDisplay';

type ScheduleTab = 'schedule' | 'events' | 'leagues';

const SCHEDULE_TABS: Array<{ tab: ScheduleTab; label: string; iconKey: string }> = [
  { tab: 'schedule', label: 'Schedule', iconKey: 'schedule-tab-schedule' },
  { tab: 'events', label: 'Events', iconKey: 'schedule-tab-events' },
  { tab: 'leagues', label: 'Leagues', iconKey: 'schedule-tab-leagues' },
];

interface ScheduleRoomHeaderProps {
  activeTab: ScheduleTab;
  onTabChange: (tab: ScheduleTab) => void;
}

export function ScheduleRoomHeader({ activeTab, onTabChange }: ScheduleRoomHeaderProps) {
  return (
    <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between py-2">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Habit Habitats</h2>
        <div className="flex items-center gap-2">
          {SCHEDULE_TABS.map(({ tab, label, iconKey }) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-label={label}
              title={label}
              className={`flex h-7 w-8 items-center justify-center rounded-full transition-colors ${
                activeTab === tab
                  ? 'bg-accent text-white'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <IconDisplay iconKey={iconKey} size={18} className="leading-none" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
