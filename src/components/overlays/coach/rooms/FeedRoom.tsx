import { useState } from 'react';
import { useUserStore } from '../../../../stores/useUserStore';
import { FeedMessage } from './FeedMessage';
import { IconDisplay } from '../../../shared/IconDisplay';

const TYPE_OPTIONS = [
  'All',
  'badge.awarded',
  'quest.progress',
  'quest.completed',
  'level.up',
  'streak.milestone',
  'event.completed',
  'marker.fire',
] as const;

const STAT_FILTERS = [
  { key: 'all' },
  { key: 'health' },
  { key: 'strength' },
  { key: 'agility' },
  { key: 'defense' },
  { key: 'charisma' },
  { key: 'wisdom' },
] as const;

export function FeedRoom() {
  const feed = useUserStore((s) => s.user?.feed);
  const markFeedEntryRead = useUserStore((s) => s.markFeedEntryRead);
  const markAllFeedRead = useUserStore((s) => s.markAllFeedRead);
  const setFeedReaction = useUserStore((s) => s.setFeedReaction);

  const entries = feed?.entries ?? [];
  const unreadCount = feed?.unreadCount ?? 0;

  const [hideRead, setHideRead] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_OPTIONS)[number]>('All');
  const [statFilter, setStatFilter] = useState<(typeof STAT_FILTERS)[number]['key']>('all');

  const indexedEntries = entries.map((entry, idx) => ({ entry, idx }));
  const filtered = indexedEntries.filter(({ entry }) => {
    if (hideRead && entry.read) return false;

    const searchValue = search.trim().toLowerCase();
    const haystack = [entry.commentBlock, entry.sourceType, entry.triggerRef ?? '']
      .join(' ')
      .toLowerCase();

    if (searchValue && !haystack.includes(searchValue)) return false;
    if (typeFilter !== 'All' && entry.sourceType !== typeFilter) return false;

    if (statFilter !== 'all') {
      const statHaystack = `${entry.sourceType} ${entry.triggerRef ?? ''}`.toLowerCase();
      if (!statHaystack.includes(statFilter)) return false;
    }

    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Feed</h3>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllFeedRead}
              className="text-xs text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search feed..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ×
              </button>
            )}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as (typeof TYPE_OPTIONS)[number])}
            className="w-40 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {STAT_FILTERS.map(({ key }) => {
              const selected = statFilter === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatFilter(key)}
                  className={[
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    selected
                      ? 'border-purple-500 bg-purple-600 text-white dark:border-purple-400 dark:bg-purple-500'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800',
                  ].join(' ')}
                >
                  {key === 'all' ? 'All' : <IconDisplay iconKey={key} size={16} className="h-4 w-4 object-contain" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setHideRead((v) => !v)}
            className={[
              'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors',
              hideRead
                ? 'border-purple-500 bg-purple-100 text-purple-700 dark:border-purple-500 dark:bg-purple-900/40 dark:text-purple-200'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800',
            ].join(' ')}
          >
            Hide read
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {entries.length === 0 ? 'No messages yet.' : 'No matching entries.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.map(({ entry, idx }) => (
            <FeedMessage
              key={idx}
              entry={entry}
              entryIndex={idx}
              onMarkRead={markFeedEntryRead}
              onSetReaction={setFeedReaction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
