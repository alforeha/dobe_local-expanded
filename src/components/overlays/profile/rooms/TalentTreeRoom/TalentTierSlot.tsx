import type { StatGroupKey, TalentNode } from '../../../../../types/user';
import { IconDisplay } from '../../../../shared/IconDisplay';

const STAT_STYLES: Record<StatGroupKey, { ring: string; bg: string; text: string }> = {
  health: { ring: 'border-red-300 dark:border-red-800', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-300' },
  strength: { ring: 'border-orange-300 dark:border-orange-800', bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-300' },
  agility: { ring: 'border-green-300 dark:border-green-800', bg: 'bg-green-50 dark:bg-green-950/30', text: 'text-green-700 dark:text-green-300' },
  defense: { ring: 'border-blue-300 dark:border-blue-800', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300' },
  charisma: { ring: 'border-pink-300 dark:border-pink-800', bg: 'bg-pink-50 dark:bg-pink-950/30', text: 'text-pink-700 dark:text-pink-300' },
  wisdom: { ring: 'border-purple-300 dark:border-purple-800', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300' },
};

interface TalentTierSlotProps {
  stat: StatGroupKey;
  node: TalentNode;
  title: string;
  description: string;
  icon: string;
  confirmPending: boolean;
  onClick: () => void;
}

export function TalentTierSlot({
  stat,
  node,
  title,
  description,
  icon,
  confirmPending,
  onClick,
}: TalentTierSlotProps) {
  const statStyle = STAT_STYLES[stat];
  const isMaxed = node.currentPoints >= node.maxPoints;
  const isLocked = !node.unlocked;

  const palette = isMaxed
    ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
    : isLocked
      ? 'border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
      : `${statStyle.ring} ${statStyle.bg} ${statStyle.text}`;

  return (
    <button
      type="button"
      className={`relative min-h-32 rounded-3xl border px-4 py-4 text-left shadow-sm transition ${
        isLocked ? 'cursor-not-allowed opacity-80' : 'hover:-translate-y-0.5'
      } ${palette}`}
      onClick={onClick}
      aria-disabled={isLocked}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 dark:bg-gray-900/50">
          <IconDisplay
            iconKey={confirmPending ? 'check' : icon}
            size={24}
            className="h-6 w-6 object-contain text-2xl leading-none"
            alt=""
          />
        </div>
        <div className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-900/50 dark:text-gray-200">
          {node.currentPoints}/{node.maxPoints}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs leading-5 opacity-90">{description}</p>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">
        {isLocked ? 'Locked' : confirmPending ? 'Tap again to confirm' : isMaxed ? 'Maxed' : `Tier ${node.tier}`}
      </p>
    </button>
  );
}
