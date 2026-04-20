import { useEffect, useRef, useState } from 'react';
import { resolveIcon } from '../../../constants/iconMap';
import { deriveLevelFromXP } from '../../../engine/awardPipeline';
import { autoCompleteSystemTask } from '../../../engine/resourceEngine';
import { useGlows } from '../../../hooks/useOnboardingGlow';
import { useUserStore } from '../../../stores/useUserStore';
import type { StatGroupKey } from '../../../types/user';
import { IconDisplay } from '../../shared/IconDisplay';
import { StatIcon } from '../../shared/StatIcon';
import { ONBOARDING_GLOW } from '../../../constants/onboardingKeys';
import { ProfileXPBar } from './ProfileXPBar';
import {
  GEAR_SLOT_LABELS,
  GEAR_SLOT_ORDER,
  getGearDefinition,
  getGearIcon,
} from './rooms/EquipmentRoom/equipmentRoomData';

const STAKE_TIERS: { minLevel: number; iconKey: string; label: string }[] = [
  { minLevel: 21, iconKey: 'stake-forest', label: 'Forest' },
  { minLevel: 11, iconKey: 'stake-grove', label: 'Grove' },
  { minLevel: 6, iconKey: 'stake-sapling', label: 'Sapling' },
  { minLevel: 3, iconKey: 'stake-sprout', label: 'Sprout' },
  { minLevel: 1, iconKey: 'stake-seed', label: 'Seed' },
];

function getStake(level: number) {
  for (const tier of STAKE_TIERS) {
    if (level >= tier.minLevel) return tier;
  }
  return STAKE_TIERS[STAKE_TIERS.length - 1];
}

type ProfileRoom = 'stats' | 'preferences' | 'storage' | 'badges' | 'equipment' | 'talent';

interface ProfileTopSectionProps {
  onNav: (room: ProfileRoom) => void;
}

const STAT_ORDER: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

const FLOATING_SLOT_CLASSES = {
  head: 'top-3 left-1/2 -translate-x-1/2',
  body: 'bottom-9 left-1/2 -translate-x-[110%]',
  hand: 'top-1/2 left-2 -translate-y-1/2',
  feet: 'bottom-9 left-1/2 translate-x-[10%]',
  accessory: 'top-1/2 right-2 -translate-y-1/2',
} as const;

export function ProfileTopSection({ onNav }: ProfileTopSectionProps) {
  const user = useUserStore((state) => state.user);
  const stats = user?.progression.stats;
  const equippedGear = user?.progression.avatar.equippedGear ?? {};
  const displayName = user?.system.displayName ?? '-';
  const profileIcon = user?.system.icon ?? 'user-default';
  const xp = stats?.xp ?? 0;
  const level = deriveLevelFromXP(xp);
  const badgeRoomGlows = useGlows(ONBOARDING_GLOW.BADGE_ROOM_NAV);
  const equipmentRoomGlows = useGlows(ONBOARDING_GLOW.EQUIPMENT_ROOM_NAV);

  const topStat = STAT_ORDER.reduce<StatGroupKey>(
    (best, key) =>
      (stats?.talents[key]?.statPoints ?? 0) > (stats?.talents[best]?.statPoints ?? 0) ? key : best,
    'health',
  );
  const topStatValue = stats?.talents[topStat]?.statPoints ?? 0;
  const stake = getStake(level);

  const avatarRef = useRef<HTMLButtonElement>(null);
  const [avatarPx, setAvatarPx] = useState(0);

  useEffect(() => {
    const element = avatarRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => setAvatarPx(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const equippedDefinitions = GEAR_SLOT_ORDER.map((slot) => ({
    slot,
    gear: getGearDefinition(equippedGear[slot]),
  }));
  const centerIconFontSize = avatarPx > 0 ? `${Math.round(avatarPx * 0.42)}px` : '3.25rem';

  const handleBadgeNav = () => {
    autoCompleteSystemTask('task-sys-open-badge-room');
    onNav('badges');
  };

  const handleEquipmentNav = () => {
    autoCompleteSystemTask('task-sys-open-equipment-room');
    onNav('equipment');
  };

  return (
    <div className="flex flex-1 flex-col border-b border-gray-100 dark:border-gray-700">
      <div className="relative isolate overflow-visible px-3 pt-3">
        <div className="flex items-center gap-2 pr-24">
          <button
            type="button"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-3xl shadow-md transition-transform hover:scale-105 dark:bg-gray-700"
            onClick={() => onNav('preferences')}
            aria-label="Preferences"
          >
            <IconDisplay iconKey={profileIcon} size={36} className="h-9 w-9 object-contain" alt="Preferences" />
          </button>

          <div className="w-44 shrink-0 rounded-2xl border border-gray-100 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p className="truncate text-sm font-bold leading-tight text-gray-800 dark:text-gray-100">{displayName}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                {level}
              </div>
              <span className="select-none text-gray-300 dark:text-gray-600">•</span>
              <StatIcon stat={topStat} value={topStatValue} />
            </div>
          </div>
        </div>

        <button
          type="button"
          className="absolute right-3 top-4 z-30 flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl shadow-md transition-transform hover:scale-105 dark:bg-gray-700"
          onClick={() => onNav('storage')}
          aria-label="Storage"
        >
          {resolveIcon('lock')}
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-3 pb-3 pt-2">
        <button
          ref={avatarRef}
          type="button"
          className="relative flex h-full aspect-square flex-col items-center justify-center overflow-visible rounded-3xl bg-emerald-50 px-6 py-6 transition-transform hover:scale-105 dark:bg-emerald-900/30"
          onClick={() => onNav('stats')}
          aria-label="View stat groups"
        >
          <div className="pointer-events-none flex flex-col items-center justify-center">
            <span className="leading-none" style={{ fontSize: centerIconFontSize }}>
              {resolveIcon(stake.iconKey)}
            </span>
          </div>

          {equippedDefinitions.map(({ slot, gear }) => (
            <div
              key={slot}
              className={`absolute z-10 flex h-12 w-12 flex-col items-center justify-center rounded-2xl border bg-white/95 shadow-sm dark:bg-gray-900/90 ${FLOATING_SLOT_CLASSES[slot]} ${
                gear ? 'border-emerald-200' : 'border-dashed border-gray-300 dark:border-gray-600'
              }`}
              aria-label={`${GEAR_SLOT_LABELS[slot]} slot`}
              title={gear ? `${GEAR_SLOT_LABELS[slot]}: ${gear.name}` : `${GEAR_SLOT_LABELS[slot]} slot empty`}
            >
              {gear ? (
                <span className="text-2xl leading-none">{getGearIcon(gear)}</span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Empty</span>
              )}
            </div>
          ))}
        </button>

        <button
          type="button"
          className="absolute bottom-3 left-3 z-20 flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl shadow-md transition-transform hover:scale-105 dark:bg-gray-700"
          onClick={handleBadgeNav}
          aria-label="Badge Room"
        >
          {resolveIcon('badge')}
          {badgeRoomGlows ? (
            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full ring-2 ring-emerald-400" />
          ) : null}
        </button>

        <button
          type="button"
          className="absolute bottom-3 right-3 z-20 flex h-20 w-20 items-center justify-center rounded-full bg-white text-3xl shadow-md transition-transform hover:scale-105 dark:bg-gray-700"
          onClick={handleEquipmentNav}
          aria-label="Equipment"
        >
          {resolveIcon('equipment')}
          {equipmentRoomGlows ? (
            <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full ring-2 ring-emerald-400" />
          ) : null}
        </button>
      </div>

      <ProfileXPBar xp={xp} />
    </div>
  );
}
