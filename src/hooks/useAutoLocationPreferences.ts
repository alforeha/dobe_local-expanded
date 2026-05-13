import { useEffect, useState } from 'react';
import { useSystemStore } from '../stores/useSystemStore';
import { reverseGeocode } from '../utils/geocode';
import type { NamedLocation } from '../types';

export function useAutoLocationPreferences(): NamedLocation | undefined {
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const [detectedLocation, setDetectedLocation] = useState<NamedLocation | undefined>();
  const autoLocationEnabled = locationPreferences?.autoLocationEnabled ?? true;
  const canUseAutoLocation = autoLocationEnabled && typeof navigator !== 'undefined' && !!navigator.geolocation;

  useEffect(() => {
    if (!canUseAutoLocation) {
      return;
    }

    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        reverseGeocode(lat, lng)
          .then((cityName) => {
            if (!cancelled) {
              setDetectedLocation({
                id: 'auto-location',
                label: 'Auto',
                lat,
                lng,
                cityName,
              });
            }
          })
          .catch(() => {
            if (!cancelled) {
              setDetectedLocation({
                id: 'auto-location',
                label: 'Auto',
                lat,
                lng,
                cityName: '',
              });
            }
          });
      },
      () => {
        if (!cancelled) {
          setDetectedLocation(undefined);
        }
      },
      {
        enableHighAccuracy: false,
        maximumAge: 60 * 60 * 1000,
        timeout: 10000,
      },
    );
    return () => {
      cancelled = true;
    };
  }, [canUseAutoLocation]);

  if (autoLocationEnabled) {
    return canUseAutoLocation ? detectedLocation : undefined;
  }

  if (!locationPreferences) return undefined;
  const locations = locationPreferences.locations.filter((location) => location.label !== 'Auto');
  const { activeLocationId } = locationPreferences;
  return locations.find((location) => location.id === activeLocationId) ?? locations[0];
}
