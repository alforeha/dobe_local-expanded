interface XPBarProps {
  displayName: string;
  level: number;
  current: number;
  max: number;
}

export function XPBar({ displayName, level, current, max }: XPBarProps) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;

  return (
    <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
      {/* fill */}
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-purple-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      {/* text overlay — name left, level right */}
      <div className="absolute inset-0 flex items-center justify-between px-2.5">
        <span
          className="text-[11px] font-semibold text-white truncate"
          style={{ textShadow: '0 0 4px rgba(0,0,0,0.65)' }}
        >
          {displayName}
        </span>
        <span
          className="ml-1 shrink-0 text-[11px] text-white/90"
          style={{ textShadow: '0 0 4px rgba(0,0,0,0.65)' }}
        >
          Lv {level}
        </span>
      </div>
    </div>
  );
}
