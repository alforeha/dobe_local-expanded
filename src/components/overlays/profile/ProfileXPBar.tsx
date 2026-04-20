import { xpProgress } from '../../../engine/awardPipeline';

interface ProfileXPBarProps {
  xp: number;
}

export function ProfileXPBar({ xp }: ProfileXPBarProps) {
  const { xpSinceLastLevel, xpForThisLevel } = xpProgress(xp);
  const pct = xpForThisLevel > 0
    ? Math.min(100, Math.round((xpSinceLastLevel / xpForThisLevel) * 100))
    : 0;

  return (
    <div className="w-full px-4 pb-3 pt-1">
      {/* Bar with labels overlaid inside */}
      <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-purple-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
        {/* Total XP left, level-up target right */}
        <div className="absolute inset-0 flex items-center justify-between px-3">
          <span
            className="text-[11px] font-semibold text-white leading-none"
            style={{ textShadow: '0 0 4px rgba(0,0,0,0.55)' }}
          >
            {xp.toLocaleString()} XP
          </span>
          <span
            className="text-[11px] text-white/80 leading-none"
            style={{ textShadow: '0 0 4px rgba(0,0,0,0.55)' }}
          >
            / {xpForThisLevel.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
