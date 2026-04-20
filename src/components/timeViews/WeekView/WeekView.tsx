import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppDate } from '../../../utils/useAppDate';
import { useAutoLocationPreferences } from '../../../hooks/useAutoLocationPreferences';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { WeekViewHeader } from './WeekViewHeader';
import { WeekViewBody } from './WeekViewBody';
import { getPrevMonday, addDays, format } from '../../../utils/dateUtils';
import { fetchWeatherForecast, type WeatherDay } from '../../../utils/weatherService';
import { buildStoredWeatherMap, mergeWeatherForDates } from '../../../utils/weatherHistory';

interface WeekViewProps {
  initialWeekStart?: Date;
  todaySignal?: number;
  onDaySelect?: (date: Date) => void;
}

export function WeekView({ initialWeekStart, todaySignal, onDaySelect }: WeekViewProps) {
  const appDate = useAppDate();
  const appDateRef = useRef(appDate);
  const locationPreferences = useAutoLocationPreferences();
  const { activeEvents, historyEvents } = useScheduleStore(useShallow((s) => ({
    activeEvents: s.activeEvents,
    historyEvents: s.historyEvents,
  })));
  // Sync ref after every render so the effect always sees the latest appDate
  useLayoutEffect(() => { appDateRef.current = appDate; });

  const [weekStart, setWeekStart] = useState(() => getPrevMonday(initialWeekStart ?? appDate));
  const [weather, setWeather] = useState<WeatherDay[]>([]);

  const goBack = () => setWeekStart((d) => addDays(d, -7));
  const goForward = () => setWeekStart((d) => addDays(d, 7));

  // Reset to current week when footer tab is tapped while already on week view
  useEffect(() => {
    if (todaySignal) setWeekStart(getPrevMonday(appDateRef.current));
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

  const todayISO = format(appDate, 'iso');
  const storedWeatherByDate = useMemo(
    () => buildStoredWeatherMap(activeEvents, historyEvents),
    [activeEvents, historyEvents],
  );
  const mergedWeather = useMemo(() => {
    const weekDateIsos = Array.from({ length: 7 }, (_, index) => format(addDays(weekStart, index), 'iso'));
    return mergeWeatherForDates(
      locationPreferences ? weather : [],
      storedWeatherByDate,
      weekDateIsos,
      todayISO,
    );
  }, [locationPreferences, storedWeatherByDate, todayISO, weather, weekStart]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <WeekViewHeader
        weekStart={weekStart}
        onBack={goBack}
        onForward={goForward}
      />
      <WeekViewBody
        weekStart={weekStart}
        onDaySelect={onDaySelect}
        weather={mergedWeather}
        todaySignal={todaySignal}
      />
    </div>
  );
}
