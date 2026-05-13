import { useEffect, useMemo, useRef, useState } from 'react';
import { useAutoLocationPreferences } from '../../hooks/useAutoLocationPreferences';
import { useSystemStore } from '../../stores/useSystemStore';
import { IconDisplay } from '../shared/IconDisplay';
import { PopupShell } from '../shared/popups/PopupShell';
import { getAppDate } from '../../utils/dateUtils';
import { fetchHourlyWeather, fetchWeatherForecast, type WeatherHour } from '../../utils/weatherService';

const AUTO_LOCATION_ID = 'auto';

interface TodayWeatherPopupProps {
  date: string;
  onClose: () => void;
}

function formatPopupDate(dateISO: string): string {
  const date = new Date(`${dateISO}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatHourLabel(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric' });
}

function formatTimeLabel(isoDateTime: string): string {
  if (!isoDateTime) return '--';
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function parseHour(isoDateTime: string): number | null {
  if (!isoDateTime) return null;
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours();
}

export function TodayWeatherPopup({
  date,
  onClose,
}: TodayWeatherPopupProps) {
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const resolvedActiveLocation = useAutoLocationPreferences();
  const [hourlyWeather, setHourlyWeather] = useState<WeatherHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [sunrise, setSunrise] = useState('');
  const [sunset, setSunset] = useState('');
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const locations = useMemo(() => locationPreferences?.locations ?? [], [locationPreferences]);
  const autoLocationEnabled = locationPreferences?.autoLocationEnabled ?? true;
  const activeLocationId = locationPreferences?.activeLocationId ?? null;
  const [viewLocationId, setViewLocationId] = useState<string | null>(activeLocationId);

  useEffect(() => {
    setViewLocationId(activeLocationId);
  }, [activeLocationId]);

  const switcherOptions = useMemo(() => {
    const namedOptions = locations.map((location) => ({
      id: location.id,
      label: location.cityName || location.label,
    }));

    if (autoLocationEnabled) {
      return [
        {
          id: AUTO_LOCATION_ID,
          label: resolvedActiveLocation?.cityName
            ? `Auto · ${resolvedActiveLocation.cityName}`
            : 'Auto',
        },
        ...namedOptions,
      ];
    }

    return namedOptions;
  }, [autoLocationEnabled, locations, resolvedActiveLocation]);

  const viewLocation = useMemo(() => {
    if (viewLocationId === AUTO_LOCATION_ID) {
      return resolvedActiveLocation;
    }
    return locations.find((location) => location.id === viewLocationId) ?? resolvedActiveLocation ?? locations[0];
  }, [locations, resolvedActiveLocation, viewLocationId]);

  useEffect(() => {
    if (!viewLocation) {
      setHourlyWeather([]);
      setSunrise('');
      setSunset('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetchHourlyWeather(viewLocation.lat, viewLocation.lng, date),
      fetchWeatherForecast(viewLocation.lat, viewLocation.lng, 16),
    ])
      .then(([hours, forecast]) => {
        if (!cancelled) {
          setHourlyWeather(hours);
          const dayForecast = forecast.find((entry) => entry.date === date);
          setSunrise(dayForecast?.sunrise ?? '');
          setSunset(dayForecast?.sunset ?? '');
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHourlyWeather([]);
          setSunrise('');
          setSunset('');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [date, viewLocation]);

  const appDate = getAppDate();
  const isToday = date === appDate;
  const currentHour = isToday ? new Date().getHours() : 0;
  const sunriseHour = useMemo(() => parseHour(sunrise), [sunrise]);
  const sunsetHour = useMemo(() => parseHour(sunset), [sunset]);

  useEffect(() => {
    if (loading || hourlyWeather.length === 0) return;
    const targetHour = isToday ? currentHour : 0;
    rowRefs.current[targetHour]?.scrollIntoView({ block: 'center' });
  }, [currentHour, hourlyWeather, isToday, loading]);

  return (
    <PopupShell
      title={formatPopupDate(date)}
      onClose={onClose}
      size="large"
      headerRight={switcherOptions.length > 0 ? (
        <select
          value={viewLocationId ?? ''}
          onChange={(event) => setViewLocationId(event.target.value)}
          className="max-w-[220px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
        >
          {switcherOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {option.id === activeLocationId ? ' ★' : ''}
            </option>
          ))}
        </select>
      ) : undefined}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4">
        {loading ? (
          <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-purple-500 dark:border-gray-700 dark:border-t-purple-400" />
            <span>Loading hourly forecast...</span>
          </div>
        ) : hourlyWeather.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-3">
              {hourlyWeather.map((hour) => {
                const isPastHour = date < appDate || (isToday && hour.hour < currentHour);
                const isCurrentHour = isToday && hour.hour === currentHour;
                return (
                  <div
                    key={hour.time}
                    ref={(node) => {
                      rowRefs.current[hour.hour] = node;
                    }}
                    className={[
                      'grid grid-cols-[minmax(88px,112px)_minmax(0,1fr)] gap-4 rounded-2xl border p-4 transition-colors',
                      isCurrentHour
                        ? 'border-purple-400 border-l-4 bg-purple-50 dark:border-purple-500 dark:bg-purple-900/20'
                        : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40',
                      isPastHour ? 'opacity-40' : '',
                    ].join(' ')}
                  >
                    <div className="flex flex-col justify-center gap-1">
                      <div className="text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                        {formatHourLabel(hour.hour)}
                      </div>
                      {sunriseHour === hour.hour && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <span aria-hidden="true">🌅</span>{' '}
                          {formatTimeLabel(sunrise)}
                        </div>
                      )}
                      {sunsetHour === hour.hour && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          <span aria-hidden="true">🌇</span>{' '}
                          {formatTimeLabel(sunset)}
                        </div>
                      )}
                    </div>

                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center gap-3 text-gray-900 dark:text-gray-100">
                        <IconDisplay iconKey={hour.icon} size={28} className="h-7 w-7 object-contain" alt="" />
                        <span className="text-lg font-semibold">{`${hour.temp}°`}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-gray-600 dark:text-gray-300">
                        <span>{`💧 ${hour.precipChance}%`}</span>
                        <span>{`💨 ${hour.windSpeed} mph`}</span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-gray-600 dark:text-gray-300">
                        <span>{`Humidity ${hour.humidity}%`}</span>
                        <span>{`UV ${hour.uvIndex}`}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[50vh] items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {viewLocation ? 'Hourly forecast is not available for this date.' : 'Select a location to view hourly weather.'}
          </div>
        )}
      </div>
    </PopupShell>
  );
}