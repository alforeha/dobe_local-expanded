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
          <span className="inline-flex items-center gap-1 text-sm leading-none text-amber-500" title="Early bird boost active">
            <IconDisplay iconKey="boost-early-bird" size={16} className="h-4 w-4 object-contain" />
            <span className="self-center leading-none">{formatMultiplier(EARLY_BIRD_MULTIPLIER)}</span>
          </span>
        )}
        {wisdomBoosts.lateNightActive && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold leading-none text-indigo-600" title="Late night wisdom boost active">
            <IconDisplay iconKey="boost-late-night" size={16} className="h-4 w-4 object-contain" />
            <span className="self-center leading-none">{formatMultiplier(LATE_NIGHT_MULTIPLIER)}</span>
          </span>
        )}
        {standardBoosts.streak > 0 && (
          <span className="inline-flex items-center gap-1 text-sm leading-none text-orange-500" title="Current streak boost">
            <IconDisplay iconKey="boost-streak" size={16} className="h-4 w-4 object-contain" />
            <span className="self-center leading-none">{formatMultiplier(standardBoosts.streakMultiplier)}</span>
          </span>
        )}
        {standardBoosts.roll && (
          <span className="inline-flex items-center gap-1 text-sm font-semibold leading-none text-purple-600" title="Daily roll bonus">
            <IconDisplay iconKey="boost-roll" size={16} className="h-4 w-4 object-contain" />
            <span className="self-center leading-none">{standardBoosts.roll.display}</span>
          </span>
        )}
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-semibold leading-none text-yellow-600">
        <IconDisplay iconKey="gold" size={16} className="h-4 w-4 object-contain" />
        <span className="self-center leading-none">{gold}</span>
      </span>
    </div>
  );
}
