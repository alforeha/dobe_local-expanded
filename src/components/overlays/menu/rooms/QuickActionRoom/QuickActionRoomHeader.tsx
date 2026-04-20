import { LuckyDiceSection } from './ActionTab/LuckyDiceSection';

type QATab = 'action' | 'shopping';

interface QuickActionRoomHeaderProps {
  activeTab: QATab;
  onTabChange: (tab: QATab) => void;
}

export function QuickActionRoomHeader({
  activeTab,
  onTabChange,
}: QuickActionRoomHeaderProps) {
  return (
    <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
      <div className="flex items-stretch gap-3">
        <div className="flex-1 flex flex-col justify-between">
          <h2 className="text-base font-semibold text-gray-800">Quick Actions</h2>
          <div className="flex gap-2 mt-2">
            {(['action', 'shopping'] as QATab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onTabChange(tab)}
                className={`text-sm px-3 py-1 rounded-full transition-colors ${
                  activeTab === tab
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {tab === 'action' ? 'Action' : 'Shopping'}
              </button>
            ))}
          </div>
        </div>
        <div className="shrink-0 flex items-center border-l border-gray-100 dark:border-gray-700 pl-3">
          <LuckyDiceSection compact />
        </div>
      </div>
    </div>
  );
}
