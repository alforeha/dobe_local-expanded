import { useEffect, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSystemStore } from '../../../../../stores/useSystemStore';

interface WorldMapContainerProps {
  children?: (map: L.Map) => ReactNode;
}

const WORLD_CENTER: L.LatLngExpression = [20, 0];
const WORLD_ZOOM = 2;
const LOCAL_ZOOM = 13;

export function WorldMapContainer({ children }: WorldMapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const locationPreferences = useSystemStore((state) => state.settings?.locationPreferences);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hasUserLocation =
      typeof locationPreferences?.lat === 'number' &&
      typeof locationPreferences?.lng === 'number';
    const initialCenter: L.LatLngExpression = hasUserLocation
      ? [locationPreferences.lat, locationPreferences.lng]
      : WORLD_CENTER;
    const initialZoom = hasUserLocation ? LOCAL_ZOOM : WORLD_ZOOM;

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

    mapRef.current = leafletMap;
    setMap(leafletMap);

    const resizeId = window.setTimeout(() => leafletMap.invalidateSize(), 50);

    return () => {
      window.clearTimeout(resizeId);
      leafletMap.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, [locationPreferences?.lat, locationPreferences?.lng]);

  return (
    <div className="cdb-world-map-wrap">
      <div ref={containerRef} className="cdb-world-map" aria-label="World View map" />
      {map ? children?.(map) : null}
    </div>
  );
}
