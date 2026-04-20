import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { achievementLibrary } from '../../../../../coach';
import { resolveIcon } from '../../../../../constants/iconMap';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { useUserStore } from '../../../../../stores/useUserStore';
import type { BadgeBoard, Badge } from '../../../../../types';
import { AchievementBook } from './AchievementBook';
import { BadgeBoardCanvas } from './BadgeBoardCanvas';

function isPlacedBadge(badge: Badge) {
  return Boolean(
    badge.contents.placed
      && typeof badge.contents.boardX === 'number'
      && typeof badge.contents.boardY === 'number',
  );
}

function syncPinnedBadges(existingPinned: Badge[], earned: Badge[], preserveOrder: boolean) {
  const placedBadges = earned.filter(isPlacedBadge);

  if (!preserveOrder) {
    return placedBadges;
  }

  const placedById = new Map(placedBadges.map((badge) => [badge.id, badge]));
  const ordered: Badge[] = [];

  existingPinned.forEach((badge) => {
    const updated = placedById.get(badge.id);
    if (updated) {
      ordered.push(updated);
      placedById.delete(badge.id);
    }
  });

  placedById.forEach((badge) => {
    ordered.push(badge);
  });

  return ordered;
}

function buildBadgeBoard(current: BadgeBoard, earned: Badge[], preserveOrder = true): BadgeBoard {
  return {
    ...current,
    earned,
    pinned: syncPinnedBadges(current.pinned, earned, preserveOrder),
  };
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function BadgeRoom() {
  const badgeBoard = useUserStore((state) => state.user?.progression.badgeBoard);
  const setBadgeBoard = useUserStore((state) => state.setBadgeBoard);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [bookOpen, setBookOpen] = useState(false);
  const [placingBadgeId, setPlacingBadgeId] = useState<string | null>(null);
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [removeBadgeId, setRemoveBadgeId] = useState<string | null>(null);

  const currentBadgeBoard = badgeBoard ?? null;
  const earnedBadges = useMemo(() => currentBadgeBoard?.earned ?? [], [currentBadgeBoard]);
  const achievements = achievementLibrary.achievements;

  const achievementById = useMemo(
    () =>
      Object.fromEntries(
        achievements.map((achievement) => [
          achievement.id,
          {
            icon: resolveIcon(achievement.icon),
            name: achievement.name,
            description: achievement.description,
          },
        ]),
      ),
    [achievements],
  );

  const earnedBadgeByAchievementId = useMemo(
    () =>
      earnedBadges.reduce<Record<string, Badge>>((map, badge) => {
        map[badge.contents.achievementRef] = badge;
        return map;
      }, {}),
    [earnedBadges],
  );

  const placedBadges = useMemo(
    () => syncPinnedBadges(currentBadgeBoard?.pinned ?? [], earnedBadges, true),
    [currentBadgeBoard, earnedBadges],
  );

  const placingBadge = placingBadgeId
    ? earnedBadges.find((badge) => badge.id === placingBadgeId) ?? null
    : null;
  const selectedBadge = selectedBadgeId
    ? earnedBadges.find((badge) => badge.id === selectedBadgeId) ?? null
    : null;
  const selectedAchievement = selectedBadge
    ? achievementById[selectedBadge.contents.achievementRef]
    : null;

  const unplacedCount = earnedBadges.filter((badge) => !badge.contents.placed).length;

  if (!currentBadgeBoard) {
    return <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Badge board unavailable.</div>;
  }

  function updateBadge(badgeId: string, updater: (badge: Badge) => Badge, preserveOrder = true) {
    const updatedEarned = earnedBadges.map((badge) => (badge.id === badgeId ? updater(badge) : badge));
    setBadgeBoard(buildBadgeBoard(currentBadgeBoard!, updatedEarned, preserveOrder));
  }

  function startPlacement(badgeId: string) {
    setBookOpen(false);
    setSelectedBadgeId(null);
    setPlacingBadgeId(badgeId);
    setPreviewPosition({ x: 50, y: 50 });
  }

  function handleBoardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!placingBadge || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
    setPreviewPosition({ x, y });
  }

  function handleBoardClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!placingBadge || !boardRef.current) {
      setSelectedBadgeId(null);
      return;
    }

    const rect = boardRef.current.getBoundingClientRect();
    const boardX = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    const boardY = clampPercent(((event.clientY - rect.top) / rect.height) * 100);

    updateBadge(
      placingBadge.id,
      (badge) => ({
        ...badge,
        contents: {
          ...badge.contents,
          placed: true,
          boardX,
          boardY,
          location: { x: boardX, y: boardY },
        },
      }),
      true,
    );

    setPlacingBadgeId(null);
    setPreviewPosition(null);
    setSelectedBadgeId(placingBadge.id);
    autoCompleteSystemTask('task-sys-place-badge');
  }

  function requestRemoveBadge(badgeId: string) {
    setSelectedBadgeId(null);
    setBookOpen(false);
    setRemoveBadgeId(badgeId);
  }

  function confirmRemoveBadge() {
    if (!removeBadgeId) return;

    updateBadge(
      removeBadgeId,
      (badge) => ({
        ...badge,
        contents: {
          ...badge.contents,
          placed: false,
          boardX: undefined,
          boardY: undefined,
          location: 'claimed',
        },
      }),
      false,
    );

    setRemoveBadgeId(null);
    setPlacingBadgeId(null);
    setPreviewPosition(null);
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Badge Board</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {unplacedCount > 0
              ? `${unplacedCount} earned badge${unplacedCount === 1 ? '' : 's'} ready to pin.`
              : 'All earned badges are either placed or waiting in your book.'}
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
          onClick={() => {
            setSelectedBadgeId(null);
            setBookOpen(true);
          }}
        >
          📖 Achievements
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3 text-xs text-gray-600 dark:bg-gray-800/80 dark:text-gray-300">
          <p>
            {placingBadge
              ? `Placement mode: ${achievementById[placingBadge.contents.achievementRef]?.name ?? placingBadge.name}`
              : 'Tap a placed badge to inspect it, or open Achievements to pin a new one.'}
          </p>
          {placingBadge ? (
            <button
              type="button"
              className="rounded-full border border-gray-300 px-3 py-1 font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              onClick={() => {
                setPlacingBadgeId(null);
                setPreviewPosition(null);
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>

        <div ref={boardRef} className="flex flex-1 flex-col">
          <BadgeBoardCanvas
            badges={placedBadges}
            achievementById={achievementById}
            placingBadge={placingBadge}
            previewPosition={previewPosition}
            selectedBadgeId={selectedBadgeId}
            onBoardClick={handleBoardClick}
            onBoardPointerMove={handleBoardPointerMove}
            onBoardPointerLeave={() => {
              if (placingBadge) {
                setPreviewPosition((current) => current ?? { x: 50, y: 50 });
              }
            }}
            onBadgeSelect={(badgeId) => {
              setSelectedBadgeId((current) => (current === badgeId ? null : badgeId));
            }}
          />
        </div>

        {selectedBadgeId ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {selectedAchievement?.name ?? 'Badge'}
                </p>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                  {selectedAchievement?.description ?? ''}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                onClick={() => requestRemoveBadge(selectedBadgeId)}
              >
                Remove from board
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {bookOpen ? (
        <AchievementBook
          achievements={achievements}
          earnedBadgeByAchievementId={earnedBadgeByAchievementId}
          onClose={() => setBookOpen(false)}
          onPinToBoard={startPlacement}
          onRemoveFromBoard={requestRemoveBadge}
        />
      ) : null}

      {removeBadgeId ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Remove from board?</p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Removing will reset placement order. Continue?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                onClick={() => setRemoveBadgeId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                onClick={confirmRemoveBadge}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
