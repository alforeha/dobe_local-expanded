import { IconDisplay } from '../../../../shared/IconDisplay';
import type { TaskRoomBodyMode } from './TaskRoomBody';

const TASK_TABS: Array<{ tab: TaskRoomBodyMode; label: string; iconKey: string }> = [
  { tab: 'userTasks', label: 'User Tasks', iconKey: 'task-tab-user' },
  { tab: 'library', label: 'Library', iconKey: 'task-tab-library' },
  { tab: 'favorites', label: 'Favorites', iconKey: 'task-tab-favorites' },
  { tab: 'resourceTasks', label: 'Resource Tasks', iconKey: 'finance' },
];

interface TaskRoomHeaderProps {
  activeTab: TaskRoomBodyMode;
  onTabChange: (tab: TaskRoomBodyMode) => void;
}

export function TaskRoomHeader({ activeTab, onTabChange }: TaskRoomHeaderProps) {
  return (
    <div className="border-b border-gray-100 px-4 pb-2 pt-4 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Tasks</h2>
        <div className="flex items-center gap-1.5">
          {TASK_TABS.map(({ tab, label, iconKey }) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-label={label}
              title={label}
              className={`flex h-9 w-10 items-center justify-center rounded-full transition-colors ${
                activeTab === tab
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-400 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <IconDisplay iconKey={iconKey} size={18} className="leading-none" alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
