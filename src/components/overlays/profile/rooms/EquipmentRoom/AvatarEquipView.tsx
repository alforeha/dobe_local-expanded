import { useMemo } from 'react';
import { useUserStore } from '../../../../../stores/useUserStore';
import { IconDisplay } from '../../../../shared/IconDisplay';
import {
  GEAR_SLOT_LABELS,
  GEAR_SLOT_ORDER,
  RARITY_RING,
  formatStatBonus,
  getGearDefinition,
} from './equipmentRoomData';
import type { GearSlot } from '../../../../../types';

interface AvatarEquipViewProps {
  onSelectSlot: (slot: GearSlot) => void;
}

export function AvatarEquipView({ onSelectSlot }: AvatarEquipViewProps) {
  const equippedGear = useUserStore((state) => state.user?.progression.avatar.equippedGear ?? {});

  const slotCards = useMemo(
    () =>
      GEAR_SLOT_ORDER.map((slot) => ({
        slot,
        gear: getGearDefinition(equippedGear[slot]),
      })),
    [equippedGear],
  );

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Equipped Slots</p>
      </div>

      <div className="relative grid flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-hidden">
        {slotCards.map(({ slot, gear }) => {
          const isAccessory = slot === 'accessory';

          return (
            <button
              key={slot}
              type="button"
              onClick={() => gear && onSelectSlot(slot)}
              disabled={!gear}
              className={`overflow-hidden rounded-2xl border p-3 text-left transition ${
                isAccessory ? 'col-span-2' : ''
              } ${
                gear
                  ? `bg-white shadow-sm ring-1 hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800/90 ${RARITY_RING[gear.rarity]}`
                  : 'border-dashed border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-500'
              } ${!gear ? 'cursor-default' : ''}`}
            >
              <div className="flex h-full min-h-[132px] flex-col rounded-xl bg-gray-50/80 p-3 dark:bg-gray-900/60">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {GEAR_SLOT_LABELS[slot]}
                  </p>
                </div>

                <div className="flex flex-1 items-center justify-center py-2">
                  {gear ? (
                    <IconDisplay iconKey={gear.assetRef} size={32} className="h-8 w-8 object-contain" />
                  ) : null}
                </div>

                <div className="text-center">
                  {gear ? (
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{formatStatBonus(gear)}</p>
                  ) : (
                    <p className="text-sm font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Empty</p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
