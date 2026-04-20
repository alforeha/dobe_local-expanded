import { useUserStore } from '../../stores/useUserStore';
import { useScheduleStore } from '../../stores/useScheduleStore';
import { useSystemStore } from '../../stores/useSystemStore';
import { IconDisplay } from '../shared/IconDisplay';
import {
  EARLY_BIRD_MULTIPLIER,
  LATE_NIGHT_MULTIPLIER,
  getXPBoostSnapshot,
} from '../../engine/xpBoosts';

function formatMultiplier(value: number): string {
  const rounded = value.toFixed(1);
  return `${rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded}x`;
}

export function BoostRow() {
  const user = useUserStore((s) => s.user);
  useScheduleStore((s) => s.activeEvents);
  useScheduleStore((s) => s.historyEvents);
  useScheduleStore((s) => s.tasks);
  useSystemStore((s) => s.appTime);
  useSystemStore((s) => s.timeOffset);
  const gold = user?.progression?.gold ?? 0;
  const standardBoosts = getXPBoostSnapshot(user);
  const wisdomBoosts = getXPBoostSnapshot(user, { isWisdomTask: true });

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {standardBoosts.earlyBirdActive && (
          <span className="flex items-center gap-1 text-xs text-amber-500" title="Early bird boost active">
            <IconDisplay iconKey="boost-early-bird" />
            <span>{formatMultiplier(EARLY_BIRD_MULTIPLIER)}</span>
          </span>
        )}
        {wisdomBoosts.lateNightActive && (
          <span className="flex items-center gap-1 text-xs font-semibold text-indigo-600" title="Late night wisdom boost active">
            <IconDisplay iconKey="boost-late-night" />
            <span>{formatMultiplier(LATE_NIGHT_MULTIPLIER)}</span>
          </span>
        )}
        {standardBoosts.streak > 0 && (
          <span className="flex items-center gap-1 text-xs text-orange-500" title="Current streak boost">
            <IconDisplay iconKey="boost-streak" />
            <span>{formatMultiplier(standardBoosts.streakMultiplier)}</span>
          </span>
        )}
        {standardBoosts.roll && (
          <span className="flex items-center gap-1 text-xs font-semibold text-purple-600" title="Daily roll bonus">
            <IconDisplay iconKey="boost-roll" />
            <span>{standardBoosts.roll.display}</span>
          </span>
        )}
      </div>
      <span className="flex items-center gap-1 text-xs font-semibold text-yellow-600">
        <IconDisplay iconKey="gold" />
        <span>{gold}</span>
      </span>
    </div>
  );
}
