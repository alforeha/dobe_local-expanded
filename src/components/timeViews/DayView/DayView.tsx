import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppDate } from '../../../utils/useAppDate';
import { useAutoLocationPreferences } from '../../../hooks/useAutoLocationPreferences';
import { useSystemStore } from '../../../stores/useSystemStore';
import { useScheduleStore } from '../../../stores/useScheduleStore';
import { DayViewHeader } from './DayViewHeader';
import { DayViewBody } from './DayViewBody';
import { DayWeatherPopup } from './DayWeatherPopup';
import { DayResourcePopup } from './DayResourcePopup';
import { format } from '../../../utils/dateUtils';
import { fetchWeatherForecast, type WeatherDay } from '../../../utils/weatherService';
import { buildStoredWeatherMap, mergeWeatherForDates } from '../../../utils/weatherHistory';

interface DayViewProps {
  onEventOpen: (eventId: string) => void;
  onResourceOpen?: (resourceId: string) => void;
  onEditPlanned?: (plannedId: string) => void;
  todaySignal?: number;
  initialDate?: Date;
}

export function DayView({ onEventOpen, onResourceOpen, onEditPlanned, todaySignal, initialDate }: DayViewProps) {
  const appDate = useAppDate();
  const appDateRef = useRef(appDate);
  const locationPreferences = useAutoLocationPreferences();
  const setLocationPreferences = useSystemStore((s) => s.setLocationPreferences);
  const { activeEvents, historyEvents } = useScheduleStore(useShallow((s) => ({
    activeEvents: s.activeEvents,
    historyEvents: s.historyEvents,
  })));
  // Sync ref after every render so the effect always sees the latest appDate
  useLayoutEffect(() => { appDateRef.current = appDate; });

  const [currentDate, setCurrentDate] = useState(initialDate ?? appDate);
  const [weather, setWeather] = useState<WeatherDay[]>([]);
  const [weatherResolved, setWeatherResolved] = useState(false);
  const [weatherPopupOpen, setWeatherPopupOpen] = useState(false);
  const [resourcePopupOpen, setResourcePopupOpen] = useState(false);

  const goBack = () =>
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() - 1);
      return n;
    });

  const goForward = () =>
    setCurrentDate((d) => {
      const n = new Date(d);
      n.setDate(n.getDate() + 1);
      return n;
    });

  // Reset to today when footer tab is tapped while already on day view
  useEffect(() => {
    if (todaySignal) setCurrentDate(appDateRef.current);
  }, [todaySignal]);

  useEffect(() => {
    if (!locationPreferences) return;

    let cancelled = false;
    fetchWeatherForecast(locationPreferences.lat, locationPreferences.lng, 16)
      .then((forecast) => {
        if (!cancelled) {
          setWeather(forecast);
          setWeatherResolved(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWeather([]);
          setWeatherResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locationPreferences]);

  const todayISO = format(appDate, 'iso');
  const currentDateISO = format(currentDate, 'iso');
  const storedWeatherByDate = useMemo(
    () => buildStoredWeatherMap(activeEvents, historyEvents),
    [activeEvents, historyEvents],
  );
  const selectedWeather = useMemo(
    () => mergeWeatherForDates(
      locationPreferences ? weather : [],
      storedWeatherByDate,
      [currentDateISO],
      todayISO,
    )[0] ?? null,
    [currentDateISO, locationPreferences, storedWeatherByDate, todayISO, weather],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <DayViewHeader
        date={currentDate}
        weather={selectedWeather}
        hasLocation={Boolean(locationPreferences)}
        weatherLoading={Boolean(locationPreferences) && !weatherResolved}
        onWeatherOpen={() => setWeatherPopupOpen(true)}
        onResourceOpen={() => setResourcePopupOpen(true)}
        onBack={goBack}
        onForward={goForward}
      />
      <DayViewBody date={currentDate} onEventOpen={onEventOpen} onEditPlanned={onEditPlanned} />
      {resourcePopupOpen && (
        <DayResourcePopup
          date={currentDate}
          onClose={() => setResourcePopupOpen(false)}
          onOpenResource={onResourceOpen}
        />
      )}
      {weatherPopupOpen && (
        <DayWeatherPopup
          currentDate={currentDate}
          weather={weather}
          locationPreferences={locationPreferences}
          onClose={() => setWeatherPopupOpen(false)}
          onSaveLocation={(lat, lng) => {
            setLocationPreferences(lat, lng);
          }}
        />
      )}
    </div>
  );
}
