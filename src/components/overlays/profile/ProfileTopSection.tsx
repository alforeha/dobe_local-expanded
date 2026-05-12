import { resolveIcon } from '../../../constants/iconMap';
import { deriveLevelFromXP } from '../../../engine/awardPipeline';
import { autoCompleteSystemTask } from '../../../engine/resourceEngine';
import { useGlows } from '../../../hooks/useOnboardingGlow';
import { useUserStore } from '../../../stores/useUserStore';
import type { StatGroupKey } from '../../../types/user';
import type { ProfileRoom } from './ProfileOverlay';
import { IconDisplay } from '../../shared/IconDisplay';
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

interface ProfileTopSectionProps {
  activeRoom: ProfileRoom;
  onNav: (room: ProfileRoom) => void;
  onClose: () => void;
}

const STAT_ORDER: StatGroupKey[] = ['health', 'strength', 'agility', 'defense', 'charisma', 'wisdom'];

const FLOATING_SLOT_CLASSES = {
  head: 'top-3 left-1/2 -translate-x-1/2',
  body: 'bottom-9 left-1/2 -translate-x-[110%]',
  hand: 'top-1/2 left-2 -translate-y-1/2',
  feet: 'bottom-9 left-1/2 translate-x-[10%]',
  accessory: 'top-1/2 right-2 -translate-y-1/2',
} as const;

export function ProfileTopSection({ activeRoom, onNav, onClose }: ProfileTopSectionProps) {
  const user = useUserStore((state) => state.user);
  const stats = user?.progression.stats;
  const equippedGear = user?.progression.avatar.equippedGear ?? {};
  const displayName = user?.system.displayName ?? '-';
  const profileIcon = user?.system.icon ?? 'user-default';
  const xp = stats?.xp ?? 0;
  const level = deriveLevelFromXP(xp);
  const badgeRoomGlows = useGlows(ONBOARDING_GLOW.BADGE_ROOM_NAV);
  const equipmentRoomGlows = useGlows(ONBOARDING_GLOW.EQUIPMENT_ROOM_NAV);
  const isStats = activeRoom === 'stats';

  const topStat = STAT_ORDER.reduce<StatGroupKey>(
    (best, key) =>
      (stats?.talents[key]?.statPoints ?? 0) > (stats?.talents[best]?.statPoints ?? 0) ? key : best,
    'health',
  );
  const topStatValue = stats?.talents[topStat]?.statPoints ?? 0;
  const stake = getStake(level);

  const equippedDefinitions = GEAR_SLOT_ORDER.map((slot) => ({
    slot,
    gear: getGearDefinition(equippedGear[slot]),
  }));

  const handleBadgeNav = () => {
    autoCompleteSystemTask('task-sys-open-badge-room');
    onNav('badges');
  };

  const handleEquipmentNav = () => {
    autoCompleteSystemTask('task-sys-open-equipment-room');
    onNav('equipment');
  };

  return (
    <div className={`relative flex flex-col overflow-hidden border-b border-gray-100 dark:border-gray-700 ${isStats ? 'flex-1' : 'flex-shrink-0'}`}>
      {isStats && (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 via-emerald-50 to-teal-100 dark:from-emerald-950 dark:via-gray-900 dark:to-teal-950" />
          <div className="absolute inset-0 bg-black/10 dark:bg-black/30" />

          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="pointer-events-none select-none text-[12rem] leading-none opacity-20 sm:text-[15rem]">
                {resolveIcon(stake.iconKey)}
              </span>
            </div>

            {equippedDefinitions.map(({ slot, gear }) => (
              <div
                key={slot}
                className={`absolute z-10 flex h-12 w-12 flex-col items-center justify-center rounded-2xl border bg-white/85 shadow-sm backdrop-blur-sm dark:bg-gray-900/80 ${FLOATING_SLOT_CLASSES[slot]} ${
                  gear ? 'border-emerald-200' : 'border-dashed border-white/40 dark:border-gray-600'
                }`}
                aria-label={`${GEAR_SLOT_LABELS[slot]} slot`}
                title={gear ? `${GEAR_SLOT_LABELS[slot]}: ${gear.name}` : `${GEAR_SLOT_LABELS[slot]} slot empty`}
              >
                {gear ? (
                  <span className="text-2xl leading-none">{getGearIcon(gear)}</span>
                ) : (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Empty</span>
                )}
              </div>
            ))}
          </div>

          <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
            <button
              type="button"
              onClick={onClose}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-red-500/80 text-white backdrop-blur transition hover:bg-red-600"
              aria-label="Close profile"
            >
              <IconDisplay iconKey="close" size={14} className="h-3.5 w-3.5 object-contain invert" alt="Close" />
            </button>
            <button
              type="button"
              onClick={() => onNav('stats')}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/45"
              aria-label="Stats"
            >
              <IconDisplay iconKey="profile-stats" size={16} className="h-4 w-4 object-contain" alt="Stats" />
            </button>
            <button
              type="button"
              onClick={() => onNav('storage')}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/45"
              aria-label="Storage"
            >
              <IconDisplay iconKey="resource-tab-inventory" size={16} className="h-4 w-4 object-contain" alt="Storage" />
            </button>
            <button
              type="button"
              onClick={handleBadgeNav}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/45"
              aria-label="Achievements"
            >
              <IconDisplay iconKey="badge" size={16} className="h-4 w-4 object-contain" alt="Achievements" />
              {badgeRoomGlows ? (
                <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full ring-2 ring-emerald-400" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={handleEquipmentNav}
              className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/45"
              aria-label="Gear"
            >
              <IconDisplay iconKey="equipment" size={16} className="h-4 w-4 object-contain" alt="Gear" />
              {equipmentRoomGlows ? (
                <div className="pointer-events-none absolute inset-0 animate-pulse rounded-full ring-2 ring-emerald-400" />
              ) : null}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNav('preferences')}
            className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-5rem)] rounded-xl border border-white/40 bg-black/30 px-3 py-2 text-left backdrop-blur transition hover:bg-black/40"
            aria-label="Open preferences"
          >
            <div className="flex items-stretch gap-2">
              <div className="flex items-center px-1">
                <IconDisplay iconKey={profileIcon} size={40} className="h-10 w-10 object-contain" alt="Profile icon" />
              </div>

              <div className="flex min-w-0 flex-col justify-center gap-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-blue-500 px-1.5 text-xs font-bold text-white">{level}</span>
                  <span className="truncate text-sm font-semibold text-white">{displayName}</span>
                </div>

                <div className="flex items-center gap-2">
                  <IconDisplay iconKey={topStat} size={14} className="h-3.5 w-3.5 object-contain" alt={topStat} />
                  <span className="text-xs text-white">{topStatValue}</span>
                </div>
              </div>
            </div>
          </button>

          <div className="relative z-10 mt-auto">
            <ProfileXPBar xp={xp} />
          </div>
        </>
      )}
    </div>
  );
}
