import { useMemo, useState } from 'react';
import { IconDisplay } from '../../shared/IconDisplay';
import { PopupShell } from '../../shared/popups/PopupShell';
import { format } from '../../../utils/dateUtils';
import type { WeatherDay } from '../../../utils/weatherService';

interface LocationPreferences {
  lat: number;
  lng: number;
}

interface DayWeatherPopupProps {
  currentDate: Date;
  weather: WeatherDay[];
  locationPreferences: LocationPreferences | undefined;
  onClose: () => void;
  onSaveLocation: (lat: number, lng: number) => void;
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
  locationPreferences,
  onClose,
  onSaveLocation,
}: DayWeatherPopupProps) {
  const [manualLat, setManualLat] = useState(locationPreferences ? String(locationPreferences.lat) : '');
  const [manualLng, setManualLng] = useState(locationPreferences ? String(locationPreferences.lng) : '');
  const [captureState, setCaptureState] = useState<'idle' | 'locating'>('idle');
  const [geoError, setGeoError] = useState<string | null>(null);

  const currentDateISO = format(currentDate, 'iso');
  const sortedWeather = useMemo(() => weather.slice().sort((a, b) => a.date.localeCompare(b.date)), [weather]);

  const canSaveManual =
    manualLat.trim() !== ''
    && manualLng.trim() !== ''
    && !Number.isNaN(Number.parseFloat(manualLat))
    && !Number.isNaN(Number.parseFloat(manualLng));

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }

    setCaptureState('locating');
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setManualLat(String(lat));
        setManualLng(String(lng));
        setCaptureState('idle');
        onSaveLocation(lat, lng);
      },
      (error) => {
        setCaptureState('idle');
        setGeoError(`Location unavailable: ${error.message}`);
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60 * 60 * 1000,
        timeout: 10000,
      },
    );
  }

  function handleSaveManual() {
    const lat = Number.parseFloat(manualLat);
    const lng = Number.parseFloat(manualLng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;
    setGeoError(null);
    onSaveLocation(lat, lng);
  }

  function handleForecastWheel(event: React.WheelEvent<HTMLDivElement>) {
    const container = event.currentTarget;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    container.scrollLeft += event.deltaY;
    event.preventDefault();
  }

  return (
    <PopupShell title="Forecast" onClose={onClose} size="large">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Location</div>
              <div className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-100">
                {locationPreferences
                  ? `${locationPreferences.lat.toFixed(4)}, ${locationPreferences.lng.toFixed(4)}`
                  : 'No saved location'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={captureState === 'locating'}
                className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
              >
                {captureState === 'locating' ? 'Locating...' : 'Use Current Location'}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <input
              type="number"
              step="any"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              placeholder="Latitude"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <input
              type="number"
              step="any"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              placeholder="Longitude"
              className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-purple-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <button
              type="button"
              onClick={handleSaveManual}
              disabled={!canSaveManual}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Save
            </button>
          </div>

          {geoError && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">{geoError}</div>
          )}
        </div>

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
      </div>
    </PopupShell>
  );
}
