import { useMemo } from 'react';
import { useUserStore } from '../../stores/useUserStore';
import { ribbet } from '../../coach/ribbet';

const FALLBACK = "Keep going — you're doing great!";

/** Passive ambient coach comment area in the footer. */
export function CoachComment() {
  const user = useUserStore((s) => s.user);
  const comment = useMemo(() => (user ? ribbet(user) : FALLBACK), [user]);

  return (
    <div className="relative z-20 -mt-2 flex min-h-0 min-w-0 flex-1 items-center justify-center px-1.5 pb-0 sm:mt-0 sm:px-2 sm:pb-1">
      <p className="max-w-full rounded-lg border border-gray-600/70 bg-gray-800/10 px-2 py-0.5 text-center text-xs italic leading-tight text-gray-500 dark:border-gray-500 dark:bg-white/5 dark:text-gray-300 sm:px-3 sm:py-1 sm:text-sm">
        {comment}
      </p>
    </div>
  );
}
