import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Badge } from '../../../../../types/itemTemplate';

interface BoardAchievement {
  icon: string;
  name: string;
  description: string;
}

interface BadgeBoardCanvasProps {
  badges: Badge[];
  achievementById: Record<string, BoardAchievement>;
  placingBadge: Badge | null;
  previewPosition: { x: number; y: number } | null;
  selectedBadgeId: string | null;
  onBoardClick: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBoardPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBoardPointerLeave: () => void;
  onBadgeSelect: (badgeId: string) => void;
}

function formatPosition(value: number | undefined) {
  if (typeof value !== 'number') return '?';
  return Math.round(value);
}

export function BadgeBoardCanvas({
  badges,
  achievementById,
  placingBadge,
  previewPosition,
  selectedBadgeId,
  onBoardClick,
  onBoardPointerMove,
  onBoardPointerLeave,
  onBadgeSelect,
}: BadgeBoardCanvasProps) {
  return (
    <div
      className={`relative min-h-72 flex-1 overflow-hidden rounded-3xl border border-gray-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 shadow-inner dark:border-gray-700 dark:from-gray-900 dark:via-gray-800 dark:to-slate-900 ${
        placingBadge ? 'cursor-crosshair' : ''
      }`}
      onPointerDown={onBoardClick}
      onPointerMove={onBoardPointerMove}
      onPointerLeave={onBoardPointerLeave}
    >
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute inset-4 rounded-[1.25rem] border border-dashed border-amber-200 dark:border-amber-500/30" />
        <div className="absolute left-6 right-6 top-1/2 h-px -translate-y-1/2 bg-white/70 dark:bg-white/10" />
        <div className="absolute bottom-6 left-1/2 top-6 w-px -translate-x-1/2 bg-white/70 dark:bg-white/10" />
      </div>

      {badges.length === 0 && !placingBadge ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Your board is ready.</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Open Achievements and pin earned badges anywhere on the board.
          </p>
        </div>
      ) : null}

      {badges.map((badge) => {
        const achievement = achievementById[badge.contents.achievementRef];
        const boardX = badge.contents.boardX ?? 50;
        const boardY = badge.contents.boardY ?? 50;
        const isSelected = selectedBadgeId === badge.id;

        return (
          <div
            key={badge.id}
            className="absolute"
            style={{ left: `${boardX}%`, top: `${boardY}%`, transform: 'translate(-50%, -50%)' }}
          >
            <button
              type="button"
              className={`relative flex h-12 w-12 items-center justify-center rounded-full border text-2xl shadow-md transition ${
                isSelected
                  ? 'border-amber-400 bg-amber-100 ring-2 ring-amber-300 dark:border-amber-300 dark:bg-amber-500/20'
                  : 'border-white/80 bg-white/90 hover:scale-105 dark:border-gray-700 dark:bg-gray-800/95'
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onBadgeSelect(badge.id);
              }}
              aria-label={achievement?.name ?? badge.name}
              title={achievement?.name ?? badge.name}
            >
              <span aria-hidden="true">{achievement?.icon ?? '🏅'}</span>
            </button>

            {isSelected && achievement ? (
              <div
                className={`absolute top-14 z-20 w-52 rounded-2xl border border-gray-200 bg-white/95 p-3 text-left shadow-xl backdrop-blur dark:border-gray-700 dark:bg-gray-900/95 ${
                  boardX > 65 ? 'right-0' : 'left-0'
                }`}
                onClick={(event) => event.stopPropagation()}
              >
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{achievement.name}</p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{achievement.description}</p>
                <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Position {formatPosition(boardX)}, {formatPosition(boardY)}
                </p>
              </div>
            ) : null}
          </div>
        );
      })}

      {placingBadge && previewPosition ? (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${previewPosition.x}%`,
            top: `${previewPosition.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300 bg-amber-100/90 text-2xl shadow-lg dark:border-amber-300/60 dark:bg-amber-500/25">
            {achievementById[placingBadge.contents.achievementRef]?.icon ?? '🏅'}
          </div>
        </div>
      ) : null}

      {placingBadge ? (
        <div className="absolute inset-x-0 bottom-0 border-t border-amber-200 bg-white/90 px-4 py-3 text-center text-xs text-gray-700 backdrop-blur dark:border-amber-500/30 dark:bg-gray-900/90 dark:text-gray-200">
          Tap anywhere on the board to place {achievementById[placingBadge.contents.achievementRef]?.name ?? placingBadge.name}.
        </div>
      ) : null}
    </div>
  );
}
