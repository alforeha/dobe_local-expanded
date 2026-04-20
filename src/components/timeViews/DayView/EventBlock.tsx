import { resolveIcon } from '../../../constants/iconMap';

interface EventBlockProps {
  eventId: string;
  name: string;
  color: string;
  startDate?: string;
  startTime: string;
  endDate?: string;
  endTime: string;
  icon?: string;
  heightPx: number;
  taskCount: number;
  taskComplete: number;
  completionState?: string;
  topOffset: number;
  colIndex: number;
  colCount: number;
  colSpan: number;
  multiDayLabel?: string;
  interactive: boolean;
  onOpen?: () => void;
  muted?: boolean;
  glow?: boolean;
}

export function EventBlock({
  name,
  color,
  startDate,
  startTime,
  endDate,
  endTime,
  icon,
  heightPx,
  taskCount,
  taskComplete,
  completionState,
  topOffset,
  colIndex,
  colCount,
  colSpan,
  multiDayLabel,
  interactive,
  onOpen,
  muted,
  glow = false,
}: EventBlockProps) {
  const widthPct = (colSpan / colCount) * 100;
  const leftPct = (colIndex / colCount) * 100;
  const isComplete = completionState === 'complete';
  const opacityClass = muted
    ? 'opacity-40'
    : isComplete
      ? 'opacity-50'
      : !interactive
        ? 'opacity-70'
        : '';
  const crossesMidnight = Boolean(startDate && endDate && endDate !== startDate);
  const timeLabel = `${startTime} \u2192 ${endTime}${crossesMidnight ? ' +' : ''}`;
  const showStartArrow = Boolean(multiDayLabel?.startsWith('\u2191 started'));
  const showContinueArrow = multiDayLabel === '\u2193 continues';
  const showAllDayArrows = multiDayLabel === '\u2B1B all day';
  const cornerArrowClass = 'absolute right-1 text-base font-semibold leading-none text-white/95';

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onOpen : undefined}
      onKeyDown={interactive && onOpen ? (e) => e.key === 'Enter' && onOpen() : undefined}
      className={`absolute flex items-center gap-1 overflow-hidden rounded px-1.5 py-1 text-white shadow-sm ${
        interactive ? 'cursor-pointer hover:brightness-110' : 'cursor-default'
      } ${opacityClass}`}
      style={{
        backgroundColor: color,
        top: `${topOffset}px`,
        left: `${leftPct}%`,
        width: `calc(${widthPct}% - 4px)`,
        height: `${heightPx}px`,
        zIndex: colIndex + 1,
      }}
    >
      {glow && (
        <div className="pointer-events-none absolute inset-0 animate-pulse rounded ring-4 ring-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]" />
      )}
      {isComplete && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden rounded">
          <span className="rotate-[-8deg] px-1 text-center text-sm font-bold tracking-widest text-white/90">
            [COMPLETED]
          </span>
        </div>
      )}
      {(showStartArrow || showAllDayArrows) && (
        <span aria-hidden="true" className={`${cornerArrowClass} top-1`}>
          {'\u2191'}
        </span>
      )}
      {(showContinueArrow || showAllDayArrows) && (
        <span aria-hidden="true" className={`${cornerArrowClass} bottom-1`}>
          {'\u2193'}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col justify-center pr-5">
        <div className="truncate text-sm font-semibold leading-tight">
          {icon && (
            <span className="mr-1 opacity-90" aria-hidden="true">
              {resolveIcon(icon)}
            </span>
          )}
          {name}
          {crossesMidnight && (
            <span
              className="ml-1 inline-flex rounded-full bg-white/20 px-1 py-0.5 align-middle text-[10px] font-semibold"
              aria-label="Overnight event"
              title="Overnight event"
            >
              {'\uD83C\uDF19'}
            </span>
          )}
        </div>
        {heightPx >= 30 && (
          <div className="truncate text-[11px] leading-tight text-white/80">{timeLabel}</div>
        )}
      </div>

      {taskCount > 0 && heightPx >= 44 && (
        <div className="shrink-0 text-base font-bold leading-none text-white/80">
          {taskComplete}/{taskCount}
        </div>
      )}
    </div>
  );
}
