import type { Badge } from '../../../../../types/itemTemplate';
import type { AchievementDefinition } from '../../../../../types/coach';
import { resolveIcon } from '../../../../../constants/iconMap';

interface AchievementBookProps {
  achievements: AchievementDefinition[];
  earnedBadgeByAchievementId: Record<string, Badge>;
  onClose: () => void;
  onPinToBoard: (badgeId: string) => void;
  onRemoveFromBoard: (badgeId: string) => void;
}

function formatPosition(value: number | undefined) {
  if (typeof value !== 'number') return '?';
  return Math.round(value);
}

export function AchievementBook({
  achievements,
  earnedBadgeByAchievementId,
  onClose,
  onPinToBoard,
  onRemoveFromBoard,
}: AchievementBookProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex h-full max-h-[34rem] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Achievements Book</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Earned badges are full color. Locked badges stay hidden.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label="Close achievements"
          >
            ✕
          </button>
        </div>

        <div className="grid flex-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
          {achievements.map((achievement) => {
            const badge = earnedBadgeByAchievementId[achievement.id];
            const isPlaced = Boolean(badge?.contents.placed);

            return (
              <article
                key={achievement.id}
                className={`rounded-2xl border p-4 ${
                  badge
                    ? 'border-amber-200 bg-amber-50/60 dark:border-amber-400/30 dark:bg-amber-500/10'
                    : 'border-gray-200 bg-gray-100/80 dark:border-gray-700 dark:bg-gray-800/80'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${
                      badge
                        ? 'bg-white text-amber-500 shadow-sm dark:bg-gray-900'
                        : 'bg-black text-transparent dark:bg-black'
                    }`}
                    aria-hidden="true"
                  >
                    {badge ? resolveIcon(achievement.icon) : '•'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${badge ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                      {achievement.name}
                    </p>
                    {badge ? (
                      <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">
                        {achievement.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                {badge ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {isPlaced ? (
                      <>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Placed at [{formatPosition(badge.contents.boardX)},{' '}
                          {formatPosition(badge.contents.boardY)}]
                        </p>
                        <button
                          type="button"
                          className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                          onClick={() => onRemoveFromBoard(badge.id)}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600"
                        onClick={() => onPinToBoard(badge.id)}
                      >
                        Pin to Board
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
