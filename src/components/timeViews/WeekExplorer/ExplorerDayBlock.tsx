import { useState, useEffect } from 'react';
import { useAppDate } from '../../../utils/useAppDate';
import { useSystemStore } from '../../../stores/useSystemStore';
import { IconDisplay } from '../../shared/IconDisplay';
import { isSameDay } from '../../../utils/dateUtils';
import type { WeatherSummaryDay } from '../../../utils/weatherService';

const BLOCK_HEIGHT_PX = 200;
const HEADER_HEIGHT_PX = 24;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ExplorerDayEventBlock {
  id: string;
  color: string;
  markerKey: 'morning' | 'night' | 'rainbow' | null;
  topPx: number;
  heightPx?: number;
  bottomPx?: number;
  endMinutes?: number;
  icon?: string;
  isComplete?: boolean;
  leftPercent: number;
  widthPercent: number;
}

function renderMarker(markerKey: ExplorerDayEventBlock['markerKey']) {
  const upArrow = '\u2191';
  const downArrow = '\u2193';

  if (markerKey === 'morning') {
    return (
      <span aria-hidden="true" className="leading-none text-[10px]">
        {upArrow}
      </span>
    );
  }

  if (markerKey === 'night') {
    return (
      <span aria-hidden="true" className="leading-none text-[10px]">
        {downArrow}
      </span>
    );
  }

  if (markerKey === 'rainbow') {
    return (
      <span
        aria-hidden="true"
        className="flex h-full flex-col items-center justify-center leading-none text-[10px]"
      >
        <span>{upArrow}</span>
        <span>{downArrow}</span>
      </span>
    );
  }

  return null;
}

interface ExplorerDayBlockProps {
  date: Date;
  resourceIcons: string[];
  hasMoreIndicators?: boolean;
  weather: WeatherSummaryDay | null;
  eventBlocks?: ExplorerDayEventBlock[];
}

export function ExplorerDayBlock({
  date,
  resourceIcons,
  hasMoreIndicators = false,
  weather,
  eventBlocks = [],
}: ExplorerDayBlockProps) {
  const today = useAppDate();
  const isToday = isSameDay(date, today);
  const isPast = !isToday && date < today;

  const timePreferences = useSystemStore((s) => s.settings?.timePreferences);
  const [rangeStartH, rangeStartM] = (timePreferences?.explorerView?.startTime ?? '00:00')
    .split(':')
    .map(Number);
  const [rangeEndH, rangeEndM] = (timePreferences?.explorerView?.endTime ?? '23:59')
    .split(':')
    .map(Number);
  const rangeStartMin = (rangeStartH ?? 0) * 60 + (rangeStartM ?? 0);
  const rangeEndMin = (rangeEndH ?? 23) * 60 + (rangeEndM ?? 59);
  const rangeMinutes = Math.max(1, rangeEndMin - rangeStartMin + 1);

  const nowToRangePct = () => {
    const n = new Date();
    const nowMin = n.getHours() * 60 + n.getMinutes();
    return (
      ((Math.max(rangeStartMin, Math.min(rangeEndMin, nowMin)) - rangeStartMin) / rangeMinutes) *
      100
    );
  };

  const [nowPct, setNowPct] = useState(nowToRangePct);
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowPct(nowToRangePct()), 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, rangeStartMin, rangeEndMin, rangeMinutes]);

  const nowMinutes = rangeStartMin + (nowPct / 100) * rangeMinutes;
  const lineTopPx = HEADER_HEIGHT_PX + ((BLOCK_HEIGHT_PX - HEADER_HEIGHT_PX) * nowPct) / 100;
  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col overflow-hidden border-r border-gray-100 dark:border-gray-700 ${isToday ? 'bg-purple-50 dark:bg-purple-900/20' : isPast ? 'opacity-40' : ''}`}
      style={{ height: `${BLOCK_HEIGHT_PX}px` }}
    >
      <div className="flex h-6 min-h-6 items-center justify-between gap-1 px-0.5 text-[10px] leading-none">
        <span className={
          date.getDate() === 1
            ? 'font-bold text-red-500'
            : isToday
              ? 'font-bold text-purple-600'
              : 'text-gray-500 dark:text-gray-400'
        }>
          {date.getDate() === 1
            ? MONTH_NAMES[date.getMonth()].slice(0, 3).toUpperCase()
            : String(date.getDate()).padStart(2, '0')}
        </span>
        <div className="flex min-h-2.5 items-center gap-0.5">
          {resourceIcons.slice(0, 1).map((iconKey) => (
            <IconDisplay
              key={iconKey}
              iconKey={iconKey}
              size={10}
              className="h-2.5 w-2.5 object-contain"
              alt=""
            />
          ))}
          {hasMoreIndicators && <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">+</span>}
          {weather && <IconDisplay iconKey={weather.icon} size={10} className="h-2.5 w-2.5 object-contain" alt="" />}
        </div>
      </div>

      {eventBlocks.map((block) => (
        (() => {
          const isPast = isToday && block.endMinutes != null && block.endMinutes <= nowMinutes;
          return (
            <div
              key={block.id}
              className={`pointer-events-none absolute flex items-start justify-end overflow-hidden rounded-sm border border-white/30 bg-opacity-90 pr-0.5 pt-0.5 text-[10px] dark:border-black/20 ${isPast ? 'opacity-40' : ''}`}
              style={{
                left: `${block.leftPercent}%`,
                width: `${block.widthPercent}%`,
                top: `${block.topPx}px`,
                ...(block.bottomPx !== undefined
                  ? { bottom: `${block.bottomPx}px` }
                  : { height: `${block.heightPx ?? 0}px` }),
                backgroundColor: block.color,
              }}
            >
              {block.icon && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <IconDisplay
                    iconKey={block.icon}
                    size={block.heightPx && block.heightPx > 20 ? 14 : 8}
                    className="object-contain opacity-80"
                    alt=""
                  />
                </div>
              )}
              {block.isComplete && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
                  preserveAspectRatio="none"
                >
                  <line
                    x1="0" y1="0"
                    x2="100%" y2="100%"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                </svg>
              )}
              {renderMarker(block.markerKey)}
            </div>
          );
        })()
      ))}

      {isToday && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10 h-0.5 bg-purple-500"
          style={{ top: `${lineTopPx}px` }}
        />
      )}
    </div>
  );
}
