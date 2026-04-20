import { useMemo, useState } from 'react';
import { autoCompleteSystemTask } from '../../../../../engine/resourceEngine';
import { useUserStore } from '../../../../../stores/useUserStore';
import type { GearSlot, StatGroupKey } from '../../../../../types';
import type { GearDefinition } from '../../../../../types/coach';
import { IconDisplay } from '../../../../shared/IconDisplay';
import { AvatarEquipView } from './AvatarEquipView';
import { GearDetailPopup } from './GearDetailPopup';
import { InventoryListView } from './InventoryListView';
import {
  GEAR_SLOT_LABELS,
  GEAR_SLOT_ORDER,
  RARITY_BADGE,
  RARITY_RING,
  formatStatBonus,
  formatXpBoost,
  getGearDefinition,
  getPrimaryStatKey,
} from './equipmentRoomData';

type SlotFilter = 'all' | GearSlot;
type RarityFilter = 'all' | GearDefinition['rarity'];
type StatFilter = 'all' | StatGroupKey;
type EquipmentTab = 'gear' | 'inventory';

interface SelectedGearState {
  gear: GearDefinition;
  mode: 'equip' | 'unequip';
}

export function EquipmentRoom() {
  const ownedGearIds = useUserStore((state) => state.user?.progression.equipment.equipment ?? []);
  const equippedGear = useUserStore((state) => state.user?.progression.avatar.equippedGear ?? {});
  const equipGear = useUserStore((state) => state.equipGear);
  const unequipGear = useUserStore((state) => state.unequipGear);

  const [activeTab, setActiveTab] = useState<EquipmentTab>('gear');
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [selectedGear, setSelectedGear] = useState<SelectedGearState | null>(null);

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

  const selectedEquippedSlot = useMemo(() => {
    if (!selectedGear || selectedGear.mode !== 'unequip') return null;
    return GEAR_SLOT_ORDER.find((slot) => equippedGear[slot] === selectedGear.gear.id) ?? selectedGear.gear.slot;
  }, [equippedGear, selectedGear]);

  function openEquippedSlot(slot: GearSlot) {
    const gear = getGearDefinition(equippedGear[slot]);
    if (!gear) return;
    setSelectedGear({ gear, mode: 'unequip' });
  }

  function openOwnedGear(gear: GearDefinition) {
    setSelectedGear({ gear, mode: 'equip' });
  }

  function handlePopupAction() {
    if (!selectedGear) return;

    if (selectedGear.mode === 'equip') {
      equipGear(selectedGear.gear.slot, selectedGear.gear.id);
      autoCompleteSystemTask('task-sys-equip-gear');
    } else if (selectedEquippedSlot) {
      unequipGear(selectedEquippedSlot);
    }

    setSelectedGear(null);
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col p-3">
        <div className="flex h-full min-h-0 w-full gap-3">
          <div className="w-[40%] min-w-[148px] max-w-[320px] flex-none">
            <AvatarEquipView onSelectSlot={openEquippedSlot} />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/80">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500 dark:text-gray-400">Loadout</p>
              </div>

              <div className="flex rounded-full bg-gray-100 p-1 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('gear')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeTab === 'gear'
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Gear
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('inventory')}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    activeTab === 'inventory'
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  Inventory
                </button>
              </div>
            </div>

            {activeTab === 'gear' ? (
              <>
                <div className="mb-4 space-y-3">
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
                  <div className="flex flex-1 items-center">
                    <p className="w-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-400">
                      No gear matches the current filters.
                    </p>
                  </div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {visibleGear.map((gear) => {
                        const equippedInSlot = equippedGear[gear.slot] === gear.id;
                        const xpBoost = formatXpBoost(gear);

                        return (
                          <button
                            key={gear.id}
                            type="button"
                            onClick={() => openOwnedGear(gear)}
                            className={`relative flex aspect-square min-h-[170px] flex-col rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ring-1 dark:border-gray-700 dark:bg-gray-800/90 ${RARITY_RING[gear.rarity]}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${RARITY_BADGE[gear.rarity]}`}>
                                {gear.rarity}
                              </span>
                              {equippedInSlot ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
                                  Equipped
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 flex flex-1 flex-col justify-between">
                              <div className="flex items-center justify-center">
                                <IconDisplay iconKey={gear.assetRef} size={48} className="h-12 w-12 object-contain" />
                              </div>

                              <div className="space-y-1">
                                <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">{gear.name}</p>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
                                  {GEAR_SLOT_LABELS[gear.slot]}
                                </p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-300">{formatStatBonus(gear)}</p>
                                {xpBoost ? <p className="text-xs text-gray-500 dark:text-gray-400">{xpBoost}</p> : null}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <InventoryListView className="flex min-h-0 flex-1 border-0 bg-transparent p-0 shadow-none" />
            )}
          </div>
        </div>
      </div>

      {selectedGear ? (
        <GearDetailPopup
          gear={selectedGear.gear}
          actionLabel={
            selectedGear.mode === 'equip'
              ? equippedGear[selectedGear.gear.slot] === selectedGear.gear.id
                ? 'Equipped'
                : 'Equip'
              : 'Unequip'
          }
          actionDisabled={selectedGear.mode === 'equip' && equippedGear[selectedGear.gear.slot] === selectedGear.gear.id}
          slotOverride={selectedEquippedSlot ?? undefined}
          onAction={handlePopupAction}
          onClose={() => setSelectedGear(null)}
        />
      ) : null}
    </>
  );
}
