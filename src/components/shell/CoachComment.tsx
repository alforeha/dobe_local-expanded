import { useMemo } from 'react';
import { useUserStore } from '../../stores/useUserStore';
import { ribbet } from '../../coach/ribbet';

const FALLBACK = "Keep going — you're doing great!";

/** Passive ambient coach comment area in the footer. */
export function CoachComment() {
  const user = useUserStore((s) => s.user);
  const comment = useMemo(() => (user ? ribbet(user) : FALLBACK), [user]);

  return (
    <div className="flex flex-1 min-w-0 items-center justify-center px-2 pb-1">
      <p className="max-w-full rounded-lg border border-gray-600/70 bg-gray-800/10 px-3 py-1 text-center text-sm italic text-gray-500 dark:border-gray-500 dark:bg-white/5 dark:text-gray-300">
        {comment}
      </p>
    </div>
  );
}
