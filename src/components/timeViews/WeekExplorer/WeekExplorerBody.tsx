import { useRef, useEffect } from 'react';
import { ExplorerWeekRow } from './ExplorerWeekRow';
import { addDays } from '../../../utils/dateUtils';
import type { WeatherSummaryDay } from '../../../utils/weatherService';

interface WeekExplorerBodyProps {
  seedDate: Date;
  windowStart: Date;
  onWeekSelect?: (weekStart: Date) => void;
  weather: WeatherSummaryDay[];
}

/** Vertical scroll 57-week grid. Each row = Mon-Sun. */
export function WeekExplorerBody({ seedDate, windowStart, onWeekSelect, weather }: WeekExplorerBodyProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const weeks = Array.from({ length: 57 }, (_, i) => addDays(windowStart, i * 7));

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const rowH = el.scrollHeight / 57;
      el.scrollTop = Math.max(0, rowH * 13 - el.clientHeight / 3);
    });
  }, [seedDate]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="min-w-0">
        {weeks.map((weekStart) => (
          <ExplorerWeekRow
            key={weekStart.toISOString()}
            weekStart={weekStart}
            weather={weather}
            onSelect={onWeekSelect ? () => onWeekSelect(weekStart) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
