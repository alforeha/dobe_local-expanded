import { useMemo, useState } from 'react';
import { characterLibrary } from '../../../../coach';
import { awardGear } from '../../../../coach/rewardPipeline';
import { resolveIcon } from '../../../../constants/iconMap';
import { IconDisplay } from '../../../shared/IconDisplay';
import { useUserStore } from '../../../../stores/useUserStore';
import type { GearSlot } from '../../../../types/avatar';
import type { StatGroupKey, User } from '../../../../types/user';
import type { GearDefinition } from '../../../../types/coach';

type SlotFilter = 'all' | GearSlot;
type RarityFilter = 'all' | GearDefinition['rarity'];
type OwnedFilter = 'all' | 'owned';
type StatFilter = 'all' | StatGroupKey;

const SLOT_LABELS: Record<SlotFilter, string> = {
  all: 'All slots',
  head: 'Head',
  body: 'Body',
  hand: 'Hand',
  feet: 'Feet',
  accessory: 'Accessory',
};

const RARITY_COLORS: Record<GearDefinition['rarity'], string> = {
  common: 'bg-gray-400',
  rare: 'bg-sky-500',
  epic: 'bg-purple-500',
  legendary: 'bg-amber-500',
};

const RARITY_BORDERS: Record<GearDefinition['rarity'], string> = {
  common: 'border-gray-400',
  rare: 'border-sky-500',
  epic: 'border-purple-500',
  legendary: 'border-amber-500',
};

const PRICE_BY_GEAR_ID: Record<string, number> = {
  'gear-legendary-crown': 150,
  'gear-all-rounder-amulet': 220,
};

const DROP_SOURCE_BY_GEAR_ID: Record<string, string> = {
  'gear-adventurer-jacket': 'Dropped from Strength Act rewards',
  'gear-streak-gloves': 'Dropped from Daily Quest streak rewards',
  'gear-veteran-boots': 'Dropped from Level 50 milestone rewards',
  'gear-endurance-boots': 'Dropped from Best Streak milestone rewards',
};

function getPrimaryStatKey(gear: GearDefinition): StatGroupKey | null {
  const stats: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
  let best: StatGroupKey | null = null;
  let bestValue = 0;

  for (const stat of stats) {
    const value = gear.statBonus?.[stat] ?? 0;
    if (value > bestValue) {
      best = stat;
      bestValue = value;
    }
  }

  return best;
}

function formatStatBonus(gear: GearDefinition): string {
  const parts = Object.entries(gear.statBonus ?? {})
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([stat, value]) => `+${value} ${stat}`);

  if (parts.length === 0) return 'No stat bonus';
  const xpBoost = gear.xpBoost > 0 ? `+${Math.round(gear.xpBoost * 100)}% XP` : null;
  return xpBoost ? `${parts.join(' · ')} · ${xpBoost}` : parts.join(' · ');
}

function getSourceLabel(gear: GearDefinition): string {
  if (gear.rarity === 'common') return 'Drops from daily quest completion';
  if (gear.rarity === 'legendary') return `Purchase for ${PRICE_BY_GEAR_ID[gear.id] ?? 100} ${resolveIcon('gold')} gold`;
  return DROP_SOURCE_BY_GEAR_ID[gear.id] ?? 'Dropped from Daily Quest progression';
}

function spendGold(user: User, amount: number): User {
  return {
    ...user,
    progression: {
      ...user.progression,
      gold: Math.max(0, (user.progression.gold ?? 0) - amount),
    },
  };
}

export function RecommendedGearTab() {
  const user = useUserStore((state) => state.user);
  const equipGear = useUserStore((state) => state.equipGear);
  const unequipGear = useUserStore((state) => state.unequipGear);
  const setUser = useUserStore((state) => state.setUser);

  const [slotFilter, setSlotFilter] = useState<SlotFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [ownedFilter, setOwnedFilter] = useState<OwnedFilter>('all');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const ownedGearIds = user?.progression.equipment.equipment;
  const ownedSet = useMemo(() => new Set(ownedGearIds ?? []), [ownedGearIds]);
  const equippedGear = user?.progression.avatar.equippedGear ?? {};

  const visible = useMemo(() => {
    return characterLibrary.gearDefinitions.filter((gear) => {
      if (slotFilter !== 'all' && gear.slot !== slotFilter) return false;
      if (rarityFilter !== 'all' && gear.rarity !== rarityFilter) return false;
      if (ownedFilter === 'owned' && !ownedSet.has(gear.id)) return false;
      if (statFilter !== 'all' && getPrimaryStatKey(gear) !== statFilter) return false;
      return true;
    });
  }, [ownedFilter, ownedSet, rarityFilter, slotFilter, statFilter]);

  const expandedGear = visible.find((gear) => gear.id === expandedId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 px-4 pt-3 pb-2">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
            <select
              value={slotFilter}
              onChange={(event) => setSlotFilter(event.target.value as SlotFilter)}
              className="min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              {Object.entries(SLOT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={rarityFilter}
              onChange={(event) => setRarityFilter(event.target.value as RarityFilter)}
              className="min-h-10 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium capitalize text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            >
              <option value="all">All rarity</option>
              <option value="common">Common</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
            <div className="flex gap-2 justify-end">
              <TogglePill label="Owned" active={ownedFilter === 'owned'} onClick={() => setOwnedFilter('owned')} />
              <TogglePill label="All" active={ownedFilter === 'all'} onClick={() => setOwnedFilter('all')} />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
              <StatPill stat="all" active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
              <StatPill stat="health" active={statFilter === 'health'} onClick={() => setStatFilter('health')} />
              <StatPill stat="strength" active={statFilter === 'strength'} onClick={() => setStatFilter('strength')} />
              <StatPill stat="agility" active={statFilter === 'agility'} onClick={() => setStatFilter('agility')} />
              <StatPill stat="defense" active={statFilter === 'defense'} onClick={() => setStatFilter('defense')} />
              <StatPill stat="charisma" active={statFilter === 'charisma'} onClick={() => setStatFilter('charisma')} />
              <StatPill stat="wisdom" active={statFilter === 'wisdom'} onClick={() => setStatFilter('wisdom')} />
          </div>
        </div>
      </div>

      <div className="relative flex-1 overflow-y-auto px-4 pb-4">
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            No gear matches the current filters.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {visible.map((gear) => {
            const owned = ownedSet.has(gear.id);
            const equipped = equippedGear[gear.slot] === gear.id;
            return (
              <button
                key={gear.id}
                type="button"
                onClick={() => setExpandedId((current) => current === gear.id ? null : gear.id)}
                className={`relative aspect-square overflow-hidden rounded-2xl border-2 p-3 text-center shadow-sm transition-transform hover:-translate-y-0.5 ${
                  expandedId === gear.id ? 'ring-2 ring-purple-200 dark:ring-purple-900/40' : ''
                } ${RARITY_BORDERS[gear.rarity]}
                ${owned ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900'}`}
              >
                <span className={`absolute right-3 top-3 h-3 w-3 rounded-full ${RARITY_COLORS[gear.rarity]}`} aria-hidden="true" />
                {equipped ? (
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    Equipped
                  </span>
                ) : null}
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  <div style={owned ? undefined : { filter: 'grayscale(100%)' }}>
                    <IconDisplay iconKey={gear.assetRef} size={48} className="h-12 w-12 object-contain" />
                  </div>
                  <p className={`text-sm font-semibold leading-tight ${owned ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}>
                    {gear.name}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {expandedGear ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4" onClick={() => setExpandedId(null)}>
            <div
              className={`max-h-[85%] w-full max-w-xl overflow-y-auto rounded-3xl border-2 bg-white p-4 shadow-xl dark:bg-gray-800 ${RARITY_BORDERS[expandedGear.rarity]}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gray-50 text-5xl dark:bg-gray-900/40">
                    <IconDisplay iconKey={expandedGear.assetRef} size={52} className="h-[52px] w-[52px] object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{expandedGear.name}</h4>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {expandedGear.slot}
                      </span>
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium capitalize text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {expandedGear.rarity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{expandedGear.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedId(null)}
                  className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Close
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoTile label="Stat Bonus" value={formatStatBonus(expandedGear)} iconKey={getPrimaryStatKey(expandedGear) ?? undefined} />
                <InfoTile label="Source" value={getSourceLabel(expandedGear)} />
              </div>

              <div className="mt-4">
                <GearActionRow
                  gear={expandedGear}
                  owned={ownedSet.has(expandedGear.id)}
                  equipped={equippedGear[expandedGear.slot] === expandedGear.id}
                  gold={user?.progression.gold ?? 0}
                  onEquip={() => equipGear(expandedGear.slot, expandedGear.id)}
                  onUnequip={() => unequipGear(expandedGear.slot)}
                  onBuy={() => {
                    if (!user) return;
                    const price = PRICE_BY_GEAR_ID[expandedGear.id] ?? 100;
                    if ((user.progression.gold ?? 0) < price) return;
                    const afterSpend = spendGold(user, price);
                    setUser(afterSpend);
                    awardGear(expandedGear.id, 'gear.shop.purchase', afterSpend);
                  }}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TogglePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  );
}

function StatPill({ stat, active, onClick }: { stat: StatFilter; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={stat}
      onClick={onClick}
      className={`min-h-10 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-purple-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
      }`}
    >
      {stat === 'all' ? 'All' : <IconDisplay iconKey={stat} size={18} className="h-[18px] w-[18px] object-contain" />}
    </button>
  );
}

function InfoTile({ label, value, iconKey }: { label: string; value: string; iconKey?: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 px-3 py-3 dark:bg-gray-900/40">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
        {iconKey ? <IconDisplay iconKey={iconKey} size={16} className="h-4 w-4 object-contain" /> : null}
        <span>{value}</span>
      </p>
    </div>
  );
}

interface GearActionRowProps {
  gear: GearDefinition;
  owned: boolean;
  equipped: boolean;
  gold: number;
  onEquip: () => void;
  onUnequip: () => void;
  onBuy: () => void;
}

function GearActionRow({ gear, owned, equipped, gold, onEquip, onUnequip, onBuy }: GearActionRowProps) {
  if (owned && equipped) {
    return (
      <button
        type="button"
        onClick={onUnequip}
        className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
      >
        Unequip
      </button>
    );
  }

  if (owned) {
    return (
      <button
        type="button"
        onClick={onEquip}
        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
      >
        Equip
      </button>
    );
  }

  if (gear.rarity === 'legendary') {
    const price = PRICE_BY_GEAR_ID[gear.id] ?? 100;
    return (
      <button
        type="button"
        disabled={gold < price}
        onClick={onBuy}
        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
          gold < price
            ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
            : 'bg-amber-500 text-white hover:bg-amber-600'
        }`}
      >
        Buy for {price} {resolveIcon('gold')}
      </button>
    );
  }

  return <p className="text-sm text-gray-500 dark:text-gray-400">Not yet dropped</p>;
}
