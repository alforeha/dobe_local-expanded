import { useEffect, useRef } from 'react';
import { useSystemStore } from '../stores/useSystemStore';

export function useAutoLocationPreferences() {
  const locationPreferences = useSystemStore((s) => s.settings?.locationPreferences);
  const setLocationPreferences = useSystemStore((s) => s.setLocationPreferences);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (locationPreferences || attemptedRef.current) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    attemptedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationPreferences(position.coords.latitude, position.coords.longitude);
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
  }, [locationPreferences, setLocationPreferences]);

  return locationPreferences;
}
