import { useMemo, useState } from 'react';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { useUserStore } from '../../../../../stores/useUserStore';
import type { GearSlot, StatGroupKey } from '../../../../../types';
import type { GearDefinition } from '../../../../../types/coach';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { GearDetailPopup } from './GearDetailPopup';
import {
  GEAR_SLOT_LABELS,
  GEAR_SLOT_ORDER,
  formatStatBonus,
  formatXpBoost,
  getGearDefinition,
  getPrimaryStatKey,
} from './equipmentRoomData';

type SlotFilter = 'all' | GearSlot;
type RarityFilter = 'all' | GearDefinition['rarity'];
type StatFilter = 'all' | StatGroupKey;

const RARITY_BORDER: Record<GearDefinition['rarity'], string> = {
  common: 'border-gray-300 dark:border-gray-600',
  rare: 'border-sky-400 dark:border-sky-500',
  epic: 'border-violet-400 dark:border-violet-500',
  legendary: 'border-amber-400 dark:border-amber-500',
};

export function EquipmentRoom({ onBack }: { onBack: () => void }) {
  const ownedGearIds = useUserStore((state) => state.user?.progression.equipment.equipment ?? []);
  const equippedGear = useUserStore((state) => state.user?.progression.avatar.equippedGear ?? {});
  const equipGear = useUserStore((state) => state.equipGear);
  const unequipGear = useUserStore((state) => state.unequipGear);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [selectedGear, setSelectedGear] = useState<GearDefinition | null>(null);

  const ownedGear = useMemo(
    () =>
      ownedGearIds
        .map((gearId) => getGearDefinition(gearId))
        .filter((gear): gear is GearDefinition => gear !== null),
    [ownedGearIds],
  );

  const visibleGear = useMemo(() => {
    return ownedGear.filter((gear) => {
      if (slotFilter !== 'all' && gear.slot !== slotFilter) return false;
      if (rarityFilter !== 'all' && gear.rarity !== rarityFilter) return false;
      if (statFilter !== 'all' && getPrimaryStatKey(gear) !== statFilter) return false;
      return true;
    });
  }, [ownedGear, rarityFilter, slotFilter, statFilter]);

  function openOwnedGear(gear: GearDefinition) {
    setSelectedGear(gear);
  }

  function handlePopupAction() {
    if (!selectedGear) return;

    if (equippedGear[selectedGear.slot] === selectedGear.id) {
      unequipGear(selectedGear.slot);
    } else {
      equipGear(selectedGear.slot, selectedGear.id);
      autoCompleteSystemTask('task-sys-equip-gear');
    }

    setSelectedGear(null);
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col p-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-gray-200 bg-white/90 dark:border-gray-700 dark:bg-gray-900/80">
          <div className="p-4 pb-0">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Loadout</p>
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid grid-cols-3 gap-2">
              <select
                value={slotFilter}
                onChange={(event) => setSlotFilter(event.target.value as SlotFilter)}
                className="min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="all">All slots</option>
                {GEAR_SLOT_ORDER.map((slot) => (
                  <option key={slot} value={slot}>
                    {GEAR_SLOT_LABELS[slot]}
                  </option>
                ))}
              </select>

              <select
                value={rarityFilter}
                onChange={(event) => setRarityFilter(event.target.value as RarityFilter)}
                className="min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium capitalize text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="all">All rarity</option>
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>

              <select
                value={statFilter}
                onChange={(event) => setStatFilter(event.target.value as StatFilter)}
                className="min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="all">All stats</option>
                <option value="health">Health</option>
                <option value="strength">Strength</option>
                <option value="agility">Agility</option>
                <option value="defense">Defense</option>
                <option value="charisma">Charisma</option>
                <option value="wisdom">Wisdom</option>
              </select>
            </div>
          </div>

          {visibleGear.length === 0 ? (
            <div className="flex flex-1 items-center px-4 pb-4">
              <p className="w-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-400">
                No gear matches the current filters.
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 p-3">
                {visibleGear.map((gear) => {
                  const equippedInSlot = equippedGear[gear.slot] === gear.id;
                  const xpBoost = formatXpBoost(gear);

                  return (
                    <div
                      key={gear.id}
                      className={equippedInSlot ? 'rounded-[1.15rem] ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-gray-900' : ''}
                    >
                      <button
                        type="button"
                        onClick={() => openOwnedGear(gear)}
                        className={`flex aspect-square w-full flex-col justify-between rounded-2xl border-2 bg-white p-2 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-800/90 ${RARITY_BORDER[gear.rarity]}`}
                      >
                        <div className="flex flex-1 items-center justify-center">
                          <IconDisplay iconKey={gear.assetRef} size={40} className="h-10 w-10 object-contain" />
                        </div>

                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                            {GEAR_SLOT_LABELS[gear.slot]}
                          </p>
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{formatStatBonus(gear)}</p>
                          {xpBoost ? <p className="text-[10px] text-gray-500 dark:text-gray-400">{xpBoost}</p> : null}
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center p-3">
          <button
            type="button"
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
            onClick={onBack}
          >
            ← Back
          </button>
        </div>
      </div>

      {selectedGear ? (
        <GearDetailPopup
          gear={selectedGear}
          isEquipped={equippedGear[selectedGear.slot] === selectedGear.id}
          onAction={handlePopupAction}
          onClose={() => setSelectedGear(null)}
        />
      ) : null}
    </>
  );
}
