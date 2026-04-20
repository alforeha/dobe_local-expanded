import type { StatGroupKey } from '../../../../../types/user';
import type { TalentGroupStats } from '../../../../../types/stats';
import { resolveIcon } from '../../../../../constants/iconMap';
import { StatIcon } from '../../../../shared/StatIcon';

interface StatIconPopupProps {
  stat: StatGroupKey;
  talentData: TalentGroupStats;
  talentPoints: number;
  onClose: () => void;
}

export function StatIconPopup({ stat, talentData, talentPoints, onClose }: StatIconPopupProps) {
  return (
    <div className="absolute z-10 left-0 top-full mt-1 rounded-lg bg-white dark:bg-gray-800 p-4 shadow-lg min-w-[200px]">
      <div className="flex items-center justify-between mb-3">
        <StatIcon stat={stat} value={talentData.statPoints} size="md" />
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">{resolveIcon('close')}</button>
      </div>
      <div className="space-y-1 text-xs text-gray-600">
        <p>Tier: <span className="font-semibold">{talentData.tier}</span></p>
        <p>XP earned: <span className="font-semibold">{talentData.xpEarned}</span></p>
        <p>Talent points available: <span className="font-semibold">{talentPoints}</span></p>
      </div>
      <p className="mt-2 text-xs text-gray-400">91-day summary — BUILD-time</p>
    </div>
  );
}
