import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSystemStore } from '../stores/useSystemStore';
import { useScheduleStore } from '../stores/useScheduleStore';
import { reverseGeocode } from '../utils/geocode';
import { fetchWeatherSummaryForDate } from '../utils/weatherService';
import { getAppDate } from '../utils/dateUtils';
import type { NamedLocation, QuickActionsEvent } from '../types';

async function backfillTodayWeather(location: NamedLocation): Promise<void> {
  const today = getAppDate();
  const qaId = `qa-${today}`;
  const scheduleStore = useScheduleStore.getState();
  const qa = scheduleStore.activeEvents[qaId] ?? scheduleStore.historyEvents[qaId];
  if (!qa || !('weatherSnapshot' in qa) || (qa as QuickActionsEvent).weatherSnapshot !== null) {
    return;
  }
  try {
    const weather = await fetchWeatherSummaryForDate(location.lat, location.lng, today);
    if (weather) {
      scheduleStore.setActiveEvent({
        ...(qa as QuickActionsEvent),
        weatherSnapshot: {
          icon: weather.icon,
          high: weather.high,
          low: weather.low,
          ...(weather.precipitation !== undefined ? { precipitation: weather.precipitation } : {}),
        },
        locationSnapshots: {
          ...(qa as QuickActionsEvent).locationSnapshots,
          [location.id]: {
            icon: weather.icon,
            high: weather.high,
            low: weather.low,
            ...(weather.precipitation !== undefined ? { precipitation: weather.precipitation } : {}),
          },
        },
      });
    }
  } catch {
    // Best-effort; leave snapshot as null if fetch fails.
  }
}

export function useAutoLocationPreferences(): NamedLocation | undefined {
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const addNamedLocation = useSystemStore((s) => s.addNamedLocation);
  const attemptedRef = useRef(false);

  useEffect(() => {
    // Only run auto-geolocation when no locations have been saved yet.
    if ((locationPreferences?.locations.length ?? 0) > 0 || attemptedRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    attemptedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        reverseGeocode(lat, lng)
          .then((cityName) => {
            const location: NamedLocation = {
              id: uuidv4(),
              label: 'Auto',
              lat,
              lng,
              cityName,
            };
            addNamedLocation(location);
            void backfillTodayWeather(location);
          })
          .catch(() => {
            const location: NamedLocation = {
              id: uuidv4(),
              label: 'Auto',
              lat,
              lng,
              cityName: '',
            };
            addNamedLocation(location);
            void backfillTodayWeather(location);
          });
      },
      () => {
        // Silent fallback: weather simply stays unavailable if the user denies location.
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60 * 60 * 1000,
        timeout: 10000,
      },
    );
  }, [locationPreferences, addNamedLocation]);

  if (!locationPreferences) return undefined;
  const { locations, activeLocationId } = locationPreferences;
  return locations.find((l) => l.id === activeLocationId) ?? locations[0];
}
