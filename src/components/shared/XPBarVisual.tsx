interface XPBarVisualProps {
  /** Current XP towards next level */
  current: number;
  /** Max XP for current level (next level threshold delta) */
  max: number;
  className?: string;
}

export function XPBarVisual({ current, max, className = '' }: XPBarVisualProps) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${className}`}>
      <div
        className="h-full rounded-full bg-purple-500 transition-all duration-300"
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}
