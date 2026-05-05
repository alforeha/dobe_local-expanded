import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAutoLocationPreferences } from '../../hooks/useAutoLocationPreferences';
import { reverseGeocode } from '../../utils/geocode';

interface AlbumLocationPickerProps {
  initialLocation?: { latitude: number; longitude: number; placeName?: string };
  onConfirm: (location: { latitude: number; longitude: number; placeName?: string }) => void;
  onCancel: () => void;
}

const WORLD_CENTER: L.LatLngExpression = [20, 0];
const WORLD_ZOOM = 2;
const LOCAL_ZOOM = 13;

function createPinIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: '<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.25));">📍</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export function AlbumLocationPicker({ initialLocation, onConfirm, onCancel }: AlbumLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const activeLocation = useAutoLocationPreferences();
  const [selectedLocation, setSelectedLocation] = useState<{ latitude: number; longitude: number } | null>(
    initialLocation
      ? { latitude: initialLocation.latitude, longitude: initialLocation.longitude }
      : null,
  );
  const [isSaving, setIsSaving] = useState(false);

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
    if (!containerRef.current || mapRef.current) return undefined;

    const leafletMap = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView(initialCenter, initialZoom);

    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
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
    const leafletMap = mapRef.current;
    if (!leafletMap) return;

    if (!selectedLocation) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const latLng = L.latLng(selectedLocation.latitude, selectedLocation.longitude);

    if (!markerRef.current) {
      const marker = L.marker(latLng, {
        draggable: true,
        icon: createPinIcon(),
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
      markerRef.current.setLatLng(latLng);
    }

    leafletMap.panTo(latLng, { animate: true });
  }, [selectedLocation]);

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
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pick Location</div>
        <button
          type="button"
          onClick={() => { void handleConfirm(); }}
          disabled={!selectedLocation || isSaving}
          className="rounded-full bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Confirm'}
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full" aria-label="Album location picker map" />
      </div>
    </div>,
    document.body,
  );
}