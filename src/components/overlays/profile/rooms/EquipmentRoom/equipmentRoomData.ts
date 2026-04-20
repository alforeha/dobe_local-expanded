import { characterLibrary } from '../../../../../coach';
import { resolveIcon } from '../../../../../constants/iconMap';
import type { GearSlot } from '../../../../../types';
import type { GearDefinition, StatGroupKey } from '../../../../../types/coach';

export const GEAR_SLOT_ORDER: GearSlot[] = ['head', 'body', 'hand', 'feet', 'accessory'];

export const GEAR_SLOT_LABELS: Record<GearSlot, string> = {
  head: 'Head',
  body: 'Body',
  hand: 'Hand',
  feet: 'Feet',
  accessory: 'Accessory',
};

export const RARITY_BADGE: Record<GearDefinition['rarity'], string> = {
  common: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200',
  rare: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  epic: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  legendary: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
};

export const RARITY_RING: Record<GearDefinition['rarity'], string> = {
  common: 'ring-gray-200 dark:ring-gray-700',
  rare: 'ring-sky-200 dark:ring-sky-900/80',
  epic: 'ring-violet-200 dark:ring-violet-900/80',
  legendary: 'ring-amber-200 dark:ring-amber-900/80',
};

export function getGearDefinition(gearId: string | null | undefined): GearDefinition | null {
  if (!gearId) return null;
  return characterLibrary.gearDefinitions.find((gear) => gear.id === gearId) ?? null;
}

export function getGearIcon(gear: Pick<GearDefinition, 'assetRef'> | null | undefined): string {
  return resolveIcon(gear?.assetRef ?? 'default');
}

export function formatSlot(slot: GearSlot): string {
  return GEAR_SLOT_LABELS[slot];
}

export function formatStatBonus(gear: Pick<GearDefinition, 'statBonus'> | null | undefined): string {
  const statBonus = gear?.statBonus;
  if (!statBonus) return 'No stat bonus';

  const parts = Object.entries(statBonus)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0)
    .map(([stat, value]) => `+${value} ${stat}`);

  return parts.length > 0 ? parts.join(' + ') : 'No stat bonus';
}

export function getPrimaryStatKey(
  gear: Pick<GearDefinition, 'statBonus'> | null | undefined,
): StatGroupKey | null {
  if (!gear?.statBonus) return null;

  const stats: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];
  let best: StatGroupKey | null = null;
  let bestValue = 0;

  for (const stat of stats) {
    const value = gear.statBonus[stat] ?? 0;
    if (value > bestValue) {
      best = stat;
      bestValue = value;
    }
  }

  return best;
}

export function formatXpBoost(gear: Pick<GearDefinition, 'xpBoost'> | null | undefined): string | null {
  const xpBoost = gear?.xpBoost ?? 0;
  if (xpBoost <= 0) return null;
  return `+${Math.round(xpBoost * 100)}% XP`;
}
