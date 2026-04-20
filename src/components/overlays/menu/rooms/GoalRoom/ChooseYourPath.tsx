import { STARTER_ACT_IDS, unlockAct } from '../../../../../coach/StarterQuestLibrary';
import { useProgressionStore } from '../../../../../stores/useProgressionStore';
import { IconDisplay } from '../../../../shared/IconDisplay';

const STAT_PATHS = [
  { id: STARTER_ACT_IDS.health, label: 'Health', iconKey: 'act-health' },
  { id: STARTER_ACT_IDS.strength, label: 'Strength', iconKey: 'fitness' },
  { id: STARTER_ACT_IDS.agility, label: 'Agility', iconKey: 'act-agility' },
  { id: STARTER_ACT_IDS.defense, label: 'Defense', iconKey: 'act-defense' },
  { id: STARTER_ACT_IDS.charisma, label: 'Charisma', iconKey: 'act-charisma' },
  { id: STARTER_ACT_IDS.wisdom, label: 'Wisdom', iconKey: 'act-wisdom' },
] as const;

export function ChooseYourPath() {
  const acts = useProgressionStore((state) => state.acts);

  return (
    <div className="mx-4 mb-1 mt-3 overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="px-3 pb-2 pt-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Choose a stat path to begin your journey
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          Activate any path - you can unlock multiple.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        {STAT_PATHS.map(({ id, label, iconKey }) => {
          const isUnlocked = Boolean(acts[id]);
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (!isUnlocked) unlockAct(id);
              }}
              disabled={isUnlocked}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                isUnlocked
                  ? 'cursor-default border-green-200 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'cursor-pointer border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-800/40'
              }`}
            >
              <IconDisplay iconKey={iconKey} size={16} className="h-4 w-4 shrink-0 object-contain" alt="" />
              <span className="flex-1 text-left">{label}</span>
              {isUnlocked && (
                <span className="text-xs font-normal opacity-70">Active</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
