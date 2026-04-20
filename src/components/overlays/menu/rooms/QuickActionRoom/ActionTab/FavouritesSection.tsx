import { useState } from 'react';
import { useScheduleStore } from '../../../../../../stores/useScheduleStore';
import { useUserStore } from '../../../../../../stores/useUserStore';
import { FavouriteTaskBlock } from './FavouriteTaskBlock';
import type { TaskTemplate, XpAward } from '../../../../../../types/taskTemplate';
import type { StatGroupKey } from '../../../../../../types/user';
import { IconDisplay } from '../../../../../shared/IconDisplay';

const STAT_KEYS: StatGroupKey[] = [
  'health',
  'strength',
  'agility',
  'defense',
  'charisma',
  'wisdom',
];

function getPrimaryStatKey(xpAward: XpAward): StatGroupKey | null {
  let best: StatGroupKey | null = null;
  let bestVal = 0;
  for (const key of STAT_KEYS) {
    const value = xpAward[key];
    if (value > bestVal) {
      bestVal = value;
      best = key;
    }
  }
  return best;
}

const FAVOURITE_FILTERS: Array<{ key: 'all' | StatGroupKey; label: string; iconKey?: string }> = [
  { key: 'all', label: 'All' },
  ...STAT_KEYS.map((key) => ({ key, label: '', iconKey: key })),
];

export function FavouritesSection() {
  const user = useUserStore((s) => s.user);
  const taskTemplates = useScheduleStore((s) => s.taskTemplates);
  const [filter, setFilter] = useState<'all' | StatGroupKey>('all');

  const favouritesList = user?.lists.favouritesList ?? [];
  const entries = favouritesList
    .map((key) => ({ key, template: taskTemplates[key] as TaskTemplate | undefined }))
    .filter((entry): entry is { key: string; template: TaskTemplate } => Boolean(entry.template));
  const filteredEntries = entries.filter(({ template }) => {
    if (filter === 'all') return true;
    return getPrimaryStatKey(template.xpAward) === filter;
  });

  return (
    <div>
      <div className="mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Favourites
        </h3>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FAVOURITE_FILTERS.map(({ key, label, iconKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {iconKey ? <IconDisplay iconKey={iconKey} size={14} className="h-3.5 w-3.5 object-contain" alt="" /> : null}
            {label}
          </button>
        ))}
      </div>

      {filteredEntries.length === 0 ? (
        <p className="text-xs text-gray-400 py-2 text-center">No favourites in this filter.</p>
      ) : (
        <div className="space-y-1.5">
          {filteredEntries.map(({ key, template }) => (
            <FavouriteTaskBlock key={key} templateKey={key} template={template} />
          ))}
        </div>
      )}
    </div>
  );
}
