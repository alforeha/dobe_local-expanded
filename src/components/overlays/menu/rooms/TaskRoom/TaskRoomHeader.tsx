import { IconDisplay } from '../../../../shared/IconDisplay';

type TaskTab = 'stat' | 'resource';

const TAB_ICONS: Record<TaskTab, string> = {
  stat: 'star',
  resource: 'finance',
};

const TAB_LABELS: Record<TaskTab, string> = {
  stat: 'Stat Tasks',
  resource: 'Resource Tasks',
};

interface TaskRoomHeaderProps {
  activeTab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  onAdd: () => void;
}

export function TaskRoomHeader({ activeTab, onTabChange, onAdd }: TaskRoomHeaderProps) {
  return (
    <div className="border-b border-gray-100 px-4 pb-3 pt-4 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Tasks</h2>
        <div className="flex items-center gap-2">
          {(['stat', 'resource'] as TaskTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-label={TAB_LABELS[tab]}
              title={TAB_LABELS[tab]}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                activeTab === tab
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'text-gray-400 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <IconDisplay iconKey={TAB_ICONS[tab]} size={24} className="h-6 w-6 object-contain" alt="" />
            </button>
          ))}
          <button
            type="button"
            onClick={onAdd}
            aria-label="Add task template"
            title="Add Task"
            className="ml-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-3xl font-light text-white shadow-sm transition-colors hover:bg-blue-600"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
