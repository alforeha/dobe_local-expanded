import { useUserStore } from '../../../../../stores/useUserStore';
import type { Badge } from '../../../../../types/itemTemplate';

export function EarnedBadgesTray() {
  const earned = useUserStore((s) => s.user?.progression.badgeBoard.earned) ?? [];

  if (earned.length === 0) {
    return (
      <p className="text-sm text-gray-400 px-1">No badges awaiting placement.</p>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto py-1">
      {earned.map((badge: Badge) => (
        <div
          key={badge.id}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-yellow-50 ring-2 ring-yellow-300 text-2xl"
          title={badge.name}
        >
          🏅
        </div>
      ))}
    </div>
  );
}
