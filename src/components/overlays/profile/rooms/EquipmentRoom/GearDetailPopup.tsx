import { PopupShell } from '../../../../shared/popups/PopupShell';
import {
  RARITY_BADGE,
  formatSlot,
  formatStatBonus,
  formatXpBoost,
  getGearIcon,
} from './equipmentRoomData';
import type { GearSlot } from '../../../../../types';
import type { GearDefinition } from '../../../../../types/coach';

interface GearDetailPopupProps {
  gear: GearDefinition;
  actionLabel: string;
  onAction: () => void;
  onClose: () => void;
  actionDisabled?: boolean;
  slotOverride?: GearSlot;
}

export function GearDetailPopup({
  gear,
  actionLabel,
  onAction,
  onClose,
  actionDisabled = false,
  slotOverride,
}: GearDetailPopupProps) {
  const xpBoost = formatXpBoost(gear);

  return (
    <PopupShell title={gear.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-4xl dark:bg-emerald-900/40">
            {getGearIcon(gear)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                {formatSlot(slotOverride ?? gear.slot)}
              </span>
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${RARITY_BADGE[gear.rarity]}`}>
                {gear.rarity}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{gear.description}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Buff</p>
          <p className="mt-1 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{formatStatBonus(gear)}</p>
          {xpBoost ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{xpBoost}</p> : null}
        </div>

        <button
          type="button"
          onClick={onAction}
          disabled={actionDisabled}
          className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
            actionDisabled
              ? 'cursor-default bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {actionLabel}
        </button>
      </div>
    </PopupShell>
  );
}
