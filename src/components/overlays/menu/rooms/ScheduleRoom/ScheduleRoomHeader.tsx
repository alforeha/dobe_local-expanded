type ScheduleTab = 'routines' | 'events' | 'resources' | 'leagues';

interface ScheduleRoomHeaderProps {
  activeTab: ScheduleTab;
  onTabChange: (tab: ScheduleTab) => void;
}

export function ScheduleRoomHeader({ activeTab, onTabChange }: ScheduleRoomHeaderProps) {
  return (
    <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
      <h2 className="text-base font-semibold text-gray-800">Schedule</h2>
      <div className="flex gap-2 mt-2">
        {(['routines', 'events', 'resources', 'leagues'] as ScheduleTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`text-sm px-3 py-1 rounded-full capitalize transition-colors ${
              activeTab === tab
                ? 'bg-blue-500 text-white'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  );
}
