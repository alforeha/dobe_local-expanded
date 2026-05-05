import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSystemStore } from '../../stores/useSystemStore';
import { reverseGeocode } from '../../utils/geocode';

interface AlbumLocationPickerProps {
  initialLocation?: { latitude: number; longitude: number; placeName?: string };
  photoUri?: string;
  onConfirm: (location?: { latitude: number; longitude: number; placeName?: string }) => void;
  onCancel: () => void;
}

interface SearchResult {
  latitude: number;
  longitude: number;
  label: string;
}

interface PhotonFeatureProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface PhotonFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: PhotonFeatureProperties;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

async function fetchSearchResults(params: URLSearchParams, signal: AbortSignal): Promise<SearchResult[]> {
  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { signal });
  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as PhotonResponse;
  return (data.features ?? []).flatMap((feature) => {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates || coordinates.length < 2) {
      return [];
    }

    const [longitude, latitude] = coordinates;
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return [];
    }

    const properties = feature.properties;
    const streetPart = [properties?.housenumber, properties?.street].filter(Boolean).join(' ');
    const label = [
      properties?.name,
      streetPart,
      properties?.city,
      properties?.state,
      properties?.country,
    ].filter(Boolean).join(', ');

    return label
      ? [{ latitude, longitude, label }]
      : [];
  });
}

const WORLD_CENTER: L.LatLngExpression = [20, 0];
const WORLD_ZOOM = 2;
const LOCAL_ZOOM = 13;
const RADIUS_DEG = 1.8;

function createPinIcon(onClearLocation: (() => void) | undefined, photoUri?: string): L.DivIcon {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';

  if (onClearLocation) {
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.setAttribute('aria-label', 'Clear location');
    clearButton.textContent = '×';
    clearButton.style.position = 'absolute';
    clearButton.style.top = photoUri ? '-10px' : '-12px';
    clearButton.style.right = photoUri ? '-8px' : '-12px';
    clearButton.style.display = 'flex';
    clearButton.style.alignItems = 'center';
    clearButton.style.justifyContent = 'center';
    clearButton.style.width = '24px';
    clearButton.style.height = '24px';
    clearButton.style.border = '2px solid #ffffff';
    clearButton.style.borderRadius = '9999px';
    clearButton.style.background = '#dc2626';
    clearButton.style.color = '#ffffff';
    clearButton.style.fontSize = '16px';
    clearButton.style.fontWeight = '700';
    clearButton.style.lineHeight = '1';
    clearButton.style.cursor = 'pointer';
    clearButton.style.boxShadow = '0 8px 18px rgba(127, 29, 29, 0.32)';
    clearButton.style.padding = '0';
    clearButton.style.zIndex = '2';

    const stopEvent = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    clearButton.addEventListener('pointerdown', stopEvent);
    clearButton.addEventListener('mousedown', stopEvent);
    clearButton.addEventListener('click', (event) => {
      stopEvent(event);
      onClearLocation();
    });

    wrapper.appendChild(clearButton);
  }

  if (photoUri) {
    const frame = document.createElement('div');
    frame.style.width = '48px';
    frame.style.height = '48px';
    frame.style.overflow = 'hidden';
    frame.style.borderRadius = '16px';
    frame.style.border = '3px solid #ffffff';
    frame.style.background = '#ffffff';
    frame.style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.28)';

    const image = document.createElement('img');
    image.src = photoUri;
    image.alt = '';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'cover';
    frame.appendChild(image);

    const notch = document.createElement('div');
    notch.style.width = '0';
    notch.style.height = '0';
    notch.style.marginTop = '-1px';
    notch.style.borderLeft = '8px solid transparent';
    notch.style.borderRight = '8px solid transparent';
    notch.style.borderTop = '12px solid #ffffff';
    notch.style.filter = 'drop-shadow(0 8px 12px rgba(15, 23, 42, 0.24))';

    wrapper.appendChild(frame);
    wrapper.appendChild(notch);
  } else {
    const circle = document.createElement('div');
    circle.style.width = '20px';
    circle.style.height = '20px';
    circle.style.borderRadius = '9999px';
    circle.style.border = '3px solid #ffffff';
    circle.style.background = '#2563eb';
    circle.style.boxShadow = '0 8px 18px rgba(37, 99, 235, 0.4)';
    wrapper.appendChild(circle);
  }

  return L.divIcon({
    className: '',
    html: wrapper,
    iconSize: photoUri ? [54, 64] : [20, 20],
    iconAnchor: photoUri ? [27, 60] : [10, 10],
  });
}

export function AlbumLocationPicker({ initialLocation, photoUri, onConfirm, onCancel }: AlbumLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const locationPreferences = useSystemStore((state) => state.settings?.locationPreferences);
  const activeLocation = useMemo(() => {
    const locations = locationPreferences?.locations ?? [];
    const activeLocationId = locationPreferences?.activeLocationId ?? null;
    return locations.find((location) => location.id === activeLocationId) ?? locations[0];
  }, [locationPreferences]);
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(
    initialLocation
      ? { latitude: initialLocation.latitude, longitude: initialLocation.longitude }
      : null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);

  function handleRequestClearLocation() {
    if (!selectedLocation) return;
    setIsClearConfirmOpen(true);
  }

  function handleConfirmClearLocation() {
    setIsClearConfirmOpen(false);
    onConfirm(undefined);
  }

  const initialCenter = useMemo<L.LatLngExpression>(() => {
    if (initialLocation) return [initialLocation.latitude, initialLocation.longitude];
    if (typeof activeLocation?.lat === 'number' && typeof activeLocation?.lng === 'number') {
      return [activeLocation.lat, activeLocation.lng];
    }
    return WORLD_CENTER;
  }, [activeLocation?.lat, activeLocation?.lng, initialLocation]);

  const initialZoom = initialLocation || (typeof activeLocation?.lat === 'number' && typeof activeLocation?.lng === 'number')
    ? LOCAL_ZOOM
    : WORLD_ZOOM;

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 3) {
      setSearchResults([]);
      setIsSearchOpen(false);
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      try {
        const query = activeLocation?.cityName?.trim()
          ? `${trimmedQuery}, ${activeLocation.cityName.trim()}`
          : trimmedQuery;
        const params = new URLSearchParams({
          q: query,
          limit: '10',
          lang: 'en',
        });
        const hasBoundingLocation = typeof activeLocation?.lat === 'number' && typeof activeLocation?.lng === 'number';

        if (hasBoundingLocation) {
          const minLon = activeLocation.lng - RADIUS_DEG;
          const maxLon = activeLocation.lng + RADIUS_DEG;
          const minLat = activeLocation.lat - RADIUS_DEG;
          const maxLat = activeLocation.lat + RADIUS_DEG;
          params.set('bbox', `${minLon},${minLat},${maxLon},${maxLat}`);
        }

        const results = await fetchSearchResults(params, controller.signal);
        setSearchResults(results);
        setIsSearchOpen(results.length > 0);
      } catch (error) {
        if ((error as DOMException).name !== 'AbortError') {
          setSearchResults([]);
          setIsSearchOpen(false);
        }
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [activeLocation?.cityName, activeLocation?.lat, activeLocation?.lng, searchQuery]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const leafletMap = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(initialCenter, initialZoom);

    L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(leafletMap);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      className: 'cdb-map-tiles',
      maxZoom: 19,
    }).addTo(leafletMap);

    const handleMapClick = (event: L.LeafletMouseEvent) => {
      setSelectedLocation({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    };

    leafletMap.on('click', handleMapClick);
    mapRef.current = leafletMap;

    const resizeId = window.setTimeout(() => leafletMap.invalidateSize(), 50);

    return () => {
      window.clearTimeout(resizeId);
      leafletMap.off('click', handleMapClick);
      leafletMap.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initialCenter, initialZoom]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedLocation) return;
    if (typeof activeLocation?.lat !== 'number' || typeof activeLocation?.lng !== 'number') return;

    mapRef.current.setView([activeLocation.lat, activeLocation.lng], LOCAL_ZOOM, { animate: true });
  }, [activeLocation?.id, activeLocation?.lat, activeLocation?.lng, selectedLocation]);

  useEffect(() => {
    const leafletMap = mapRef.current;
    if (!leafletMap) return;

    if (!selectedLocation) {
      markerRef.current?.remove();
      markerRef.current = null;
      setIsClearConfirmOpen(false);
      return;
    }

    const latLng = L.latLng(selectedLocation.latitude, selectedLocation.longitude);

    if (!markerRef.current) {
      const marker = L.marker(latLng, {
        draggable: true,
        icon: createPinIcon(handleRequestClearLocation, photoUri),
      }).addTo(leafletMap);

      marker.on('dragend', () => {
        const position = marker.getLatLng();
        setSelectedLocation({
          latitude: position.lat,
          longitude: position.lng,
        });
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setIcon(createPinIcon(handleRequestClearLocation, photoUri));
      markerRef.current.setLatLng(latLng);
    }

    leafletMap.panTo(latLng, { animate: true });
  }, [photoUri, selectedLocation]);

  function focusActiveLocation() {
    if (!mapRef.current) return;
    if (typeof activeLocation?.lat !== 'number' || typeof activeLocation?.lng !== 'number') return;
    setSelectedLocation({
      latitude: activeLocation.lat,
      longitude: activeLocation.lng,
    });
    mapRef.current.setView([activeLocation.lat, activeLocation.lng], LOCAL_ZOOM, { animate: true });
  }

  function selectSearchResult(result: SearchResult) {
    setSelectedLocation({ latitude: result.latitude, longitude: result.longitude });
    setSearchQuery(result.label);
    setIsSearchOpen(false);
    mapRef.current?.setView([result.latitude, result.longitude], LOCAL_ZOOM, { animate: true });
  }

  async function handleConfirm() {
    if (!selectedLocation) return;

    setIsSaving(true);
    try {
      const placeName = await reverseGeocode(selectedLocation.latitude, selectedLocation.longitude);
      onConfirm({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        ...(placeName && placeName !== 'Unknown location' ? { placeName } : {}),
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-white dark:bg-gray-950">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="text-base font-semibold text-gray-900 dark:text-gray-100">Set Location</div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" aria-label="Album location picker map" />

        <div className="pointer-events-none absolute inset-0">
          <div className="pointer-events-auto absolute left-1/2 top-4 z-[1000] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 md:left-4 md:w-80 md:translate-x-0">
            <div className="rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/10 backdrop-blur-sm dark:bg-gray-900/92 dark:ring-white/10">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) {
                    setIsSearchOpen(true);
                  }
                }}
                placeholder="Search for an address..."
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            {isSearchOpen ? (
              <div className="mt-2 overflow-hidden rounded-2xl bg-white/95 shadow-xl ring-1 ring-black/10 backdrop-blur-sm dark:bg-gray-900/92 dark:ring-white/10">
                <div className="max-h-72 overflow-y-auto py-1">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.latitude}:${result.longitude}:${result.label}`}
                      type="button"
                      onClick={() => selectSearchResult(result)}
                      className="block w-full px-3 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                    >
                      {result.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {isSearching ? (
              <div className="mt-2 rounded-xl bg-white/95 px-3 py-2 text-xs text-gray-500 shadow-lg ring-1 ring-black/10 backdrop-blur-sm dark:bg-gray-900/92 dark:text-gray-300 dark:ring-white/10">
                Searching...
              </div>
            ) : null}
          </div>

          <div className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[1000] border-t border-black/10 bg-white/95 px-4 py-4 backdrop-blur-sm dark:border-white/10 dark:bg-gray-950/92">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <button
                type="button"
                onClick={focusActiveLocation}
                className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-lg ring-1 ring-black/10 transition hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-100 dark:ring-white/10 dark:hover:bg-gray-800"
              >
                Pick Location
              </button>
              <button
                type="button"
                onClick={() => { void handleConfirm(); }}
                disabled={!selectedLocation || isSaving}
                className="min-w-0 flex-1 rounded-2xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 dark:disabled:bg-gray-700 dark:disabled:text-gray-400"
              >
                {isSaving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>

          {isClearConfirmOpen ? (
            <div className="pointer-events-auto absolute bottom-24 left-1/2 z-[1001] w-[calc(100%-2rem)] max-w-xs -translate-x-1/2 rounded-2xl bg-white/96 p-3 shadow-2xl ring-1 ring-black/10 backdrop-blur-sm dark:bg-gray-900/96 dark:ring-white/10">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Clear this location?</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">You can set it again by placing the pin.</p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClearConfirmOpen(false)}
                  className="rounded-xl px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearLocation}
                  className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}