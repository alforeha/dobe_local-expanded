import type { CoachRoom } from './CoachOverlay';
import { resolveIcon } from '../../../constants/iconMap';

interface CoachOverlayFooterProps {
  activeRoom: CoachRoom;
  onNav: (room: CoachRoom) => void;
  onClose: () => void;
}

const ROOMS: { room: Exclude<CoachRoom, 'feed'>; label: string; ariaLabel: string }[] = [
  { room: 'controlcenter', label: 'Control Center', ariaLabel: 'Control Center' },
  { room: 'track', label: 'Track', ariaLabel: 'Track' },
  { room: 'review', label: 'Review', ariaLabel: 'Review' },
];

export function CoachOverlayFooter({ activeRoom, onNav, onClose }: CoachOverlayFooterProps) {
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
          {ROOMS.map(({ room, label, ariaLabel }) => (
            <button
              key={room}
              type="button"
              aria-label={ariaLabel}
              aria-pressed={activeRoom === room}
              onClick={() => onNav(room)}
              className={`flex-1 px-3 py-3 text-sm font-medium transition-colors ${
                activeRoom === room
                  ? 'bg-purple-50 text-purple-600 dark:bg-purple-950/20'
                  : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}
