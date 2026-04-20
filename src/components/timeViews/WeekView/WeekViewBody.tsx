import { useMemo, useRef, useEffect } from 'react';
import { WeekDayBlock } from './WeekDayBlock';
import { getWeekDays, format } from '../../../utils/dateUtils';
import { useSystemStore } from '../../../stores/useSystemStore';
import { useAppDate } from '../../../utils/useAppDate';
import type { WeatherSummaryDay } from '../../../utils/weatherService';

const DAY_WIDTH = 240;

interface WeekViewBodyProps {
  weekStart: Date;
  weather: WeatherSummaryDay[];
  onDaySelect?: (date: Date) => void;
  todaySignal?: number;
}

export function WeekViewBody({ weekStart, weather, onDaySelect, todaySignal }: WeekViewBodyProps) {
  const appDate = useAppDate();
  const days = getWeekDays(weekStart);
  const visibleDays = useSystemStore((s) => s.settings?.timePreferences?.weekView?.visibleDays ?? [0, 1, 2, 3, 4, 5, 6]);
  const filteredDays = days.filter((_, i) => visibleDays.includes(i));
  const weatherByDate = useMemo(() => new Map(weather.map((entry) => [entry.date, entry])), [weather]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Center the current day column when the week changes or today is tapped
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const todayIndex = filteredDays.findIndex(
      (d) => d.getFullYear() === appDate.getFullYear() && d.getMonth() === appDate.getMonth() && d.getDate() === appDate.getDate(),
    );
    if (todayIndex < 0) return;
    el.scrollLeft = Math.max(0, todayIndex * DAY_WIDTH - (el.clientWidth / 2 - DAY_WIDTH / 2));
  }, [todaySignal, filteredDays, appDate]);

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (!scrollRef.current) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    scrollRef.current.scrollLeft += e.deltaY;
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain" onWheel={handleWheel}>
      <div className="flex h-full min-h-full flex-col p-2" style={{ minWidth: `${filteredDays.length * 240}px` }}>
        <div className="flex flex-1 min-h-0 gap-1">
          {filteredDays.map((day) => (
            <WeekDayBlock
              key={day.toISOString()}
              date={day}
              weather={weatherByDate.get(format(day, 'iso')) ?? null}
              onDaySelect={onDaySelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
