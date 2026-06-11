import { useState } from 'react';
import { IconDisplay } from '../../../../shared/IconDisplay';

type LeaguesView = 'leagues' | 'leaderboard';

const LEAGUES_VIEWS: Array<{ view: LeaguesView; iconKey: string; label: string }> = [
  { view: 'leagues', iconKey: 'schedule-tab-leagues', label: 'Leagues' },
  { view: 'leaderboard', iconKey: 'schedule-tab-leaderboard', label: 'Leaderboard' },
];

export function LeaguesTabContent() {
  const [activeView, setActiveView] = useState<LeaguesView>('leagues');

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 py-2">
          {LEAGUES_VIEWS.map(({ view, iconKey, label }) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveView(view)}
              aria-label={label}
              title={label}
              className={`flex h-7 w-8 items-center justify-center rounded-full transition-colors ${
                activeView === view
                  ? 'bg-accent text-white'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <IconDisplay iconKey={iconKey} size={18} className="leading-none" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeView === 'leagues' && (
          <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Leagues</div>
        )}
        {activeView === 'leaderboard' && (
          <div className="px-4 py-4 text-sm text-gray-700 dark:text-gray-200">Leaderboard</div>
        )}
      </div>
    </div>
  );
}