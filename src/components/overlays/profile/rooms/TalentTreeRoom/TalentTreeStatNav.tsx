import type { StatGroupKey } from '../../../../../types/user';
import { IconDisplay } from '../../../../shared/IconDisplay';

const STAT_ORDER: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

interface TalentTreeStatNavProps {
  activeStat: StatGroupKey;
  onSelect: (stat: StatGroupKey) => void;
}

export function TalentTreeStatNav({ activeStat, onSelect }: TalentTreeStatNavProps) {
  return (
    <div className="shrink-0 border-b border-gray-100 px-4 py-2 dark:border-gray-700">
      <div className="grid grid-cols-6 gap-2">
        {STAT_ORDER.map((stat) => (
          <button
            key={stat}
            type="button"
            className={`rounded-2xl border px-2 py-3 transition ${
              activeStat === stat
                ? 'border-emerald-300 bg-emerald-50/90 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/30'
                : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-500'
            }`}
            onClick={() => onSelect(stat)}
            aria-pressed={activeStat === stat}
          >
            <div className="flex items-center justify-center leading-none">
              <IconDisplay iconKey={stat} size={28} className="h-7 w-7 object-contain" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
