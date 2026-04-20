import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppDate } from '../../../utils/useAppDate';
import { useAutoLocationPreferences } from '../../../hooks/useAutoLocationPreferences';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { WeekExplorerHeader } from './WeekExplorerHeader';
import { WeekExplorerSubHeader } from './WeekExplorerSubHeader';
import { WeekExplorerBody } from './WeekExplorerBody';
import { getPrevMonday, addDays, format } from '../../../utils/dateUtils';
import { fetchWeatherForecast, type WeatherDay } from '../../../utils/weatherService';
import { buildStoredWeatherMap, mergeWeatherForDates } from '../../../utils/weatherHistory';

interface WeekExplorerProps {
  onWeekSelect?: (weekStart: Date) => void;
  todaySignal?: number;
}

/** 57-week rolling window explorer. Seed date defaults to today. */
export function WeekExplorer({ onWeekSelect, todaySignal }: WeekExplorerProps) {
  const appDate = useAppDate();
  const appDateRef = useRef(appDate);
  const locationPreferences = useAutoLocationPreferences();
  const { activeEvents, historyEvents } = useScheduleStore(useShallow((s) => ({
    activeEvents: s.activeEvents,
    historyEvents: s.historyEvents,
  })));
  useLayoutEffect(() => { appDateRef.current = appDate; });

  const [seedDate, setSeedDate] = useState(appDate);
  const [weather, setWeather] = useState<WeatherDay[]>([]);

  useEffect(() => {
    if (todaySignal) setSeedDate(appDateRef.current);
  }, [todaySignal]);

  useEffect(() => {
    if (!locationPreferences) return;

    let cancelled = false;
    fetchWeatherForecast(locationPreferences.lat, locationPreferences.lng, 16)
      .then((forecast) => {
        if (!cancelled) setWeather(forecast);
      })
      .catch(() => {
        if (!cancelled) setWeather([]);
      });

    return () => {
      cancelled = true;
    };
  }, [locationPreferences]);

  const windowStart = addDays(getPrevMonday(seedDate), -13 * 7);
  const windowEnd = addDays(windowStart, 57 * 7 - 1);
  const todayISO = format(appDate, 'iso');
  const storedWeatherByDate = useMemo(
    () => buildStoredWeatherMap(activeEvents, historyEvents),
    [activeEvents, historyEvents],
  );
  const mergedWeather = useMemo(() => {
    const windowDateIsos = Array.from({ length: 57 * 7 }, (_, index) => format(addDays(windowStart, index), 'iso'));
    return mergeWeatherForDates(
      locationPreferences ? weather : [],
      storedWeatherByDate,
      windowDateIsos,
      todayISO,
    );
  }, [locationPreferences, storedWeatherByDate, todayISO, weather, windowStart]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <WeekExplorerHeader
        seedDate={seedDate}
        windowStart={windowStart}
        windowEnd={windowEnd}
        onSeedChange={setSeedDate}
      />
      <WeekExplorerSubHeader />
      <WeekExplorerBody
        seedDate={seedDate}
        windowStart={windowStart}
        onWeekSelect={onWeekSelect}
        weather={mergedWeather}
      />
    </div>
  );
}
