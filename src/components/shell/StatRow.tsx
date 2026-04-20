import { useUserStore } from '../../stores/useUserStore';
import { StatIcon } from '../shared/StatIcon';
import type { StatGroupKey } from '../../types';

const STAT_KEYS: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

export function StatRow() {
  const user = useUserStore((s) => s.user);
  const talents = user?.progression?.stats?.talents;

  return (
    <div className="flex w-full items-center gap-1">
      {STAT_KEYS.map((key) => (
        <div key={key} className="flex min-w-0 flex-1 justify-center">
          <StatIcon
            stat={key}
            value={talents?.[key]?.statPoints ?? 0}
            size="sm"
            showLabel={false}
            layout="inline"
          />
        </div>
      ))}
    </div>
  );
}
