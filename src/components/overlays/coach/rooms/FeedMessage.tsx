import type { FeedEntry } from '../../../../types';
import { getFeedSourceIcon } from './feedConstants';
import { localISODate } from '../../../../utils/dateUtils';

const REACTIONS: { emoji: string; key: string }[] = [
  { emoji: '👍', key: 'agree' },
  { emoji: '💪', key: 'motivated' },
  { emoji: '🐸', key: 'ribbit' },
  { emoji: '⭐', key: 'save' },
];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const today = localISODate(new Date());
  const entryDate = iso.slice(0, 10);
  if (entryDate === today) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface FeedMessageProps {
  entry: FeedEntry;
  entryIndex: number;
  onMarkRead: (index: number) => void;
  onSetReaction: (index: number, reaction: string) => void;
}

export function FeedMessage({
  entry,
  entryIndex,
  onMarkRead,
  onSetReaction,
}: FeedMessageProps) {
  const isRead = entry.read === true;
  const activeReaction = entry.reaction;

  return (
    <div
      className={[
        'mx-3 my-2 overflow-hidden rounded-xl border bg-white dark:bg-gray-800',
        'border-gray-200 dark:border-gray-700',
        !isRead ? 'border-l-4 border-l-emerald-500' : '',
        isRead ? 'opacity-60' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex gap-2 px-3 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="select-none text-base leading-none" aria-hidden="true">
            {getFeedSourceIcon(entry.sourceType)}
          </span>
          <p className="text-sm leading-snug text-gray-900 dark:text-gray-100">
            {entry.commentBlock}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span className="mb-1 text-xs leading-none text-gray-500 dark:text-gray-400">
            {formatTimestamp(entry.timestamp)}
          </span>
          <div className="flex gap-1">
            {REACTIONS.map(({ emoji, key }) => (
              <button
                key={key}
                type="button"
                aria-label={key}
                onClick={() => onSetReaction(entryIndex, key)}
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full border text-base leading-none transition-colors',
                  activeReaction === key
                    ? 'border-purple-500 bg-purple-600 text-white shadow-sm dark:border-purple-400 dark:bg-purple-500'
                    : 'border-gray-200 bg-transparent text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700',
                ].join(' ')}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isRead) onMarkRead(entryIndex);
            }}
            className={[
              'mt-1 rounded-lg px-2 py-0.5 text-xs transition-colors',
              isRead
                ? 'cursor-default text-gray-400 dark:text-gray-500'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50',
            ].join(' ')}
          >
            {isRead ? '✓ Read' : 'Read'}
          </button>
        </div>
      </div>
    </div>
  );
}
