// ─────────────────────────────────────────
// geocode.ts — Nominatim geocoding utilities
// Nominatim terms require a User-Agent header identifying the application.
// Results are stored at save-time; Nominatim is NOT called on every weather fetch.
// ─────────────────────────────────────────

const USER_AGENT = 'CAN-DO-BE/1.0';

interface NominatimReverseResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
  };
}

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name?: string;
}

/**
 * Reverse geocode a lat/lng pair to a human-readable city name.
 * Returns "Unknown location" on any error or missing data.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      lat: String(lat),
      lon: String(lng),
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      { headers: { 'User-Agent': USER_AGENT } },
    );
    if (!response.ok) return 'Unknown location';
    const data = (await response.json()) as NominatimReverseResponse;
    return (
      data.address?.city ??
      data.address?.town ??
      data.address?.village ??
      data.address?.county ??
      'Unknown location'
    );
  } catch {
    return 'Unknown location';
  }
}

/**
 * Forward geocode an address string to lat/lng.
 * Returns null if no results found or on any error.
 */
export async function forwardGeocode(
  address: string,
): Promise<{ lat: number; lng: number; displayName?: string } | null> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      q: address,
      limit: '1',
    });
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      { headers: { 'User-Agent': USER_AGENT } },
    );
    if (!response.ok) return null;
    const results = (await response.json()) as NominatimSearchResult[];
    if (!results.length) return null;
    const first = results[0];
    const lat = parseFloat(first.lat);
    const lon = parseFloat(first.lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lng: lon, displayName: first.display_name };
  } catch {
    return null;
  }
}
