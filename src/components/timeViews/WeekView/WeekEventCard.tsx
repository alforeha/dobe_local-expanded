import { IconDisplay } from '../../shared/IconDisplay';

interface WeekEventCardProps {
  name: string;
  multiDayLabel?: string;
  color: string;
  topPx: number;
  heightPx: number;
  leftPercent: number;
  widthPercent: number;
  icon?: string;
  isComplete?: boolean;
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
  icon,
  isComplete,
  muted,
}: WeekEventCardProps) {
  const showStartArrow = Boolean(multiDayLabel?.startsWith('started'));
  const showContinueArrow = multiDayLabel === 'continues';
  const showAllDayArrows = multiDayLabel === 'all day';
  const upArrow = '\u2191';
  const downArrow = '\u2193';
  const cornerArrowClass = 'absolute right-1 text-sm font-semibold leading-none text-white/95';
  const opacityClass = muted ? 'opacity-40' : isComplete ? 'opacity-50' : '';

  return (
    <div
      className={`absolute overflow-hidden rounded text-xs font-medium text-white ${opacityClass}`}
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
        {isComplete && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded">
            <span className="rotate-[-8deg] px-1 text-center text-sm font-bold tracking-widest text-white/90">
              [COMPLETED]
            </span>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1 pr-4">
          {icon && <IconDisplay iconKey={icon} size={12} className="h-3 w-3 shrink-0 object-contain" alt="" />}
          <span className="truncate">{name}</span>
        </div>
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
