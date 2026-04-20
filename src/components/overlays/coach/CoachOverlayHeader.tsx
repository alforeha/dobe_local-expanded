import { useMemo, useState } from 'react';
import { useUserStore } from '../../../stores/useUserStore';
import { ribbet } from '../../../coach/ribbet';
import logoSrc from '../../../assets/icons/logo_canClosed.svg';

interface CoachOverlayHeaderProps {
  onAbout: () => void;
  onFeedNav: () => void;
  unreadCount: number;
}

export function CoachOverlayHeader({ onAbout, onFeedNav, unreadCount }: CoachOverlayHeaderProps) {
  const user = useUserStore((s) => s.user);
  const comment = useMemo(() => (user ? ribbet(user) : ''), [user]);
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="relative flex items-center gap-3 pr-6">
        <button
          type="button"
          aria-label="About coach"
          onClick={onAbout}
          className="group relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-colors"
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 scale-75 rounded-full bg-emerald-100/0 transition-all duration-200 group-hover:scale-100 group-hover:bg-emerald-100/90 dark:group-hover:bg-emerald-900/50"
          />
          {logoFailed ? (
            <>
              {/* TODO: replace with logo.svg when asset is ready */}
              <span aria-hidden="true" className="relative text-4xl">🐸</span>
            </>
          ) : (
            <img
              src={logoSrc}
              alt="Coach logo"
              className="relative h-14 w-auto max-w-none object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.16)]"
              onError={() => setLogoFailed(true)}
            />
          )}
        </button>

        <div className="relative min-w-0 flex-1">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-5 py-3 text-center shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
            {comment ? (
              <p className="text-sm italic text-gray-700 dark:text-gray-200">
                {comment}
              </p>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">...</p>
            )}
          </div>

          <button
            type="button"
            aria-label={unreadCount > 0 ? `${unreadCount} unread feed messages` : 'Feed'}
            onClick={onFeedNav}
            className="absolute -right-2 -top-3 flex h-11 w-11 items-center justify-center rounded-full border border-amber-200 bg-white text-2xl shadow-md transition-transform hover:scale-105 dark:border-amber-900/70 dark:bg-gray-900"
          >
            <span aria-hidden="true">🐝</span>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-80" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900" />
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
