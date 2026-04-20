import type { StatGroupKey } from '../../../types/user';
import { StatIcon } from '../../shared/StatIcon';

interface AvatarFloatingCardProps {
  displayName: string;
  topStat: StatGroupKey;
  topStatValue: number;
}

export function AvatarFloatingCard({ displayName, topStat, topStatValue }: AvatarFloatingCardProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-gray-800 px-3 py-2 shadow-md text-center">
      <p className="text-sm font-bold text-gray-800">{displayName}</p>
      <div className="mt-1 flex justify-center">
        <StatIcon stat={topStat} value={topStatValue} />
      </div>
    </div>
  );
}
