interface WeekEventCardProps {
  name: string;
  multiDayLabel?: string;
  color: string;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  muted?: boolean;
}

/** Absolutely-positioned event card in WeekView. Left border color swatch, name truncated. */
export function WeekEventCard({
  name,
  multiDayLabel,
  color,
  topPx,
  heightPx,
  leftPercent,
  widthPercent,
  muted,
}: WeekEventCardProps) {
  const showStartArrow = Boolean(multiDayLabel?.startsWith('started'));
  const showContinueArrow = multiDayLabel === 'continues';
  const showAllDayArrows = multiDayLabel === 'all day';
  const upArrow = '\u2191';
  const downArrow = '\u2193';
  const cornerArrowClass = 'absolute right-1 text-sm font-semibold leading-none text-white/95';

  return (
    <div
      className={`absolute overflow-hidden rounded text-xs font-medium text-white ${muted ? 'opacity-40' : ''}`}
      style={{
        top: topPx,
        height: heightPx,
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        borderLeft: `4px solid ${color}`,
        backgroundColor: `${color}cc`,
      }}
    >
      <div className="relative flex h-full flex-col justify-center overflow-hidden px-1 text-left leading-tight">
        <span className="truncate pr-4">{name}</span>
        {(showStartArrow || showAllDayArrows) && (
          <span
            aria-hidden="true"
            className={`${cornerArrowClass} top-0.5`}
          >
            {upArrow}
          </span>
        )}
        {(showContinueArrow || showAllDayArrows) && (
          <span
            aria-hidden="true"
            className={`${cornerArrowClass} bottom-0.5`}
          >
            {downArrow}
          </span>
        )}
      </div>
    </div>
  );
}
