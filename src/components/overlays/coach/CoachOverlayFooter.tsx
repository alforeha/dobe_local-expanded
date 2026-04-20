import type { CoachRoom } from './CoachOverlay';
import { GlowRing } from '../../shared/GlowRing';
import { ONBOARDING_GLOW } from '../../../constants/onboardingKeys';
import { useGlows } from '../../../hooks/useOnboardingGlow';
import { resolveIcon } from '../../../constants/iconMap';

interface CoachOverlayFooterProps {
  activeRoom: CoachRoom;
  onNav: (room: CoachRoom) => void;
  userLevel: number;
  onClose: () => void;
}

export const LEADERBOARD_LEVEL_GATE = 5;

const ROOMS: { room: CoachRoom; icon: string; ariaLabel: string }[] = [
  { room: 'recommendations', icon: '🎯', ariaLabel: 'Recommendations' },
  { room: 'reviewing', icon: '🔍', ariaLabel: 'Reviewing' },
  { room: 'tracking', icon: '📍', ariaLabel: 'Tracking' },
  { room: 'leaderboard', icon: '🏅', ariaLabel: 'Leaderboard' },
];

export function CoachOverlayFooter({
  activeRoom,
  onNav,
  userLevel,
  onClose,
}: CoachOverlayFooterProps) {
  const showLeaderboard = userLevel >= LEADERBOARD_LEVEL_GATE;
  const recommendationsNavGlows = useGlows(ONBOARDING_GLOW.RECOMMENDATIONS_NAV);

  const visibleRooms = ROOMS.filter((r) => r.room !== 'leaderboard' || showLeaderboard);

  return (
    <nav className="shrink-0 border-t border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center gap-2 px-2">
        <button
          type="button"
          aria-label="Close coach"
          onClick={onClose}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
        >
          {resolveIcon('splash')}
        </button>

        <div className="flex min-w-0 flex-1 justify-end">
          {visibleRooms.map(({ room, icon, ariaLabel }) => (
            <GlowRing
              key={room}
              active={room === 'recommendations' && recommendationsNavGlows}
              rounded="lg"
              className="flex-1"
            >
              <button
                type="button"
                aria-label={ariaLabel}
                aria-pressed={activeRoom === room}
                onClick={() => onNav(room)}
                className={`flex h-full w-full items-center justify-center py-3 text-2xl transition-colors ${
                  activeRoom === room
                    ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/20'
                    : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {icon}
              </button>
            </GlowRing>
          ))}
        </div>
      </div>
    </nav>
  );
}
