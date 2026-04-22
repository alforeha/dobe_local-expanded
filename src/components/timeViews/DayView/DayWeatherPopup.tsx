import { useMemo, useState, useEffect } from 'react';
import { IconDisplay } from '../../shared/IconDisplay';
import { PopupShell } from '../../shared/popups/PopupShell';
import { LocationManager } from '../../weather/LocationManager';
import { useSystemStore } from '../../../stores/useSystemStore';
import { fetchWeatherForecast } from '../../../utils/weatherService';
import { format } from '../../../utils/dateUtils';
import type { WeatherDay } from '../../../utils/weatherService';

interface DayWeatherPopupProps {
  currentDate: Date;
  weather: WeatherDay[];
  onClose: () => void;
}

function formatShortDate(dateISO: string): string {
  const date = new Date(`${dateISO}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeLabel(isoDateTime: string): string {
  if (!isoDateTime) return '--';
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function DayWeatherPopup({
  currentDate,
  weather,
  onClose,
}: DayWeatherPopupProps) {
  const [locationManagerOpen, setLocationManagerOpen] = useState(false);

  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const locations = locationPreferences?.locations ?? [];
  const activeLocationId = locationPreferences?.activeLocationId ?? null;

  // viewLocationId is local to this popup — switching it does NOT change activeLocationId
  const [viewLocationId, setViewLocationId] = useState<string | null>(activeLocationId);
  const viewLocation = locations.find((l) => l.id === viewLocationId) ?? locations.find((l) => l.id === activeLocationId) ?? locations[0];

  // Fetch weather for the view location when it differs from the active location
  const [altWeather, setAltWeather] = useState<WeatherDay[] | null>(null);
  const [altLoading, setAltLoading] = useState(false);

  useEffect(() => {
    if (!viewLocation) return;
    // If this is the active location, use the weather passed in from the parent
    const activeLocation = locations.find((l) => l.id === activeLocationId);
    if (viewLocation.id === activeLocationId || (activeLocation && viewLocation.lat === activeLocation.lat && viewLocation.lng === activeLocation.lng)) {
      setAltWeather(null);
      return;
    }
    let cancelled = false;
    setAltLoading(true);
    fetchWeatherForecast(viewLocation.lat, viewLocation.lng, 16)
      .then((forecast) => {
        if (!cancelled) {
          setAltWeather(forecast);
          setAltLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAltWeather([]);
          setAltLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [viewLocation, activeLocationId, locations]);

  const displayWeather = altWeather !== null ? altWeather : weather;

  const currentDateISO = format(currentDate, 'iso');
  const sortedWeather = useMemo(
    () => displayWeather.slice().sort((a, b) => a.date.localeCompare(b.date)),
    [displayWeather],
  );

  function handleForecastWheel(event: React.WheelEvent<HTMLDivElement>) {
    const container = event.currentTarget;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    container.scrollLeft += event.deltaY;
    event.preventDefault();
  }

  if (locationManagerOpen) {
    return (
      <PopupShell title="Locations" onClose={onClose} size="large">
        <LocationManager onClose={() => setLocationManagerOpen(false)} />
      </PopupShell>
    );
  }

  return (
    <PopupShell title="Forecast" onClose={onClose} size="large">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4">
        <div className="min-h-0 flex-1">
          {sortedWeather.length > 0 ? (
            <div
              className="flex h-full items-stretch gap-3 overflow-x-auto pb-2"
              onWheel={handleForecastWheel}
            >
              {sortedWeather.map((day) => {
                const isSelected = day.date === currentDateISO;
                return (
                  <div
                    key={day.date}
                    className={`flex h-full min-w-[200px] shrink-0 flex-col rounded-2xl border p-4 ${isSelected ? 'border-purple-400 bg-purple-50 dark:border-purple-500 dark:bg-purple-900/20' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40'}`}
                  >
                    <div className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      {formatShortDate(day.date)}
                    </div>
                    <div className="mt-3">
                      <IconDisplay iconKey={day.icon} size={40} className="h-10 w-10 object-contain" alt="" />
                    </div>
                    <div className="mt-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">{`${day.high}\u00b0`}</div>
                    <div className="text-base text-gray-500 dark:text-gray-400">{`Low ${day.low}\u00b0`}</div>
                    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">UV</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{day.uvIndex}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">Wind</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{`${day.windSpeed} mph`}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">Rain</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{`${day.precipitationChance}%`}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">Humidity</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{`${day.humidity}%`}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">Sunrise</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{formatTimeLabel(day.sunrise)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">Sunset</div>
                        <div className="font-semibold text-gray-800 dark:text-gray-100">{formatTimeLabel(day.sunset)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Forecast will appear here once a location is available.
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-gray-200 pt-3 dark:border-gray-700">
          {locations.length > 1 ? (
            <select
              value={viewLocationId ?? ''}
              onChange={(e) => setViewLocationId(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.cityName || loc.label}
                  {loc.id === activeLocationId ? ' ★' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {viewLocation ? (viewLocation.cityName || viewLocation.label) : ''}
              {altLoading ? ' …' : ''}
            </span>
          )}
          {altLoading && locations.length > 1 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">Loading…</span>
          )}
          <button
            type="button"
            onClick={() => setLocationManagerOpen(true)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Manage locations
          </button>
        </div>
      </div>
    </PopupShell>
  );
}
