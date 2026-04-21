import { useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useSystemStore } from '../stores/useSystemStore';
import { reverseGeocode } from '../utils/geocode';
import type { NamedLocation } from '../types';

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
