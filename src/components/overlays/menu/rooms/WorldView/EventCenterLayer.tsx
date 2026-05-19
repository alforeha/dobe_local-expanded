import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';

export interface EventCenter {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  category: EventCenterCategory;
  tags: Record<string, string>;
}

export type EventCenterCategory =
  | 'outdoors'
  | 'food'
  | 'faith'
  | 'arts'
  | 'sports'
  | 'health'
  | 'education'
  | 'travel';

const CATEGORY_CONFIG: Record<EventCenterCategory, { label: string; color: string; emoji: string }> = {
  outdoors: { label: 'Outdoors', color: '#16a34a', emoji: '\uD83C\uDF32' },
  food: { label: 'Food & Drink', color: '#ea580c', emoji: '\uD83C\uDF7D\uFE0F' },
  faith: { label: 'Faith', color: '#7c3aed', emoji: '\u26EA' },
  arts: { label: 'Arts & Culture', color: '#db2777', emoji: '\uD83C\uDFA8' },
  sports: { label: 'Sports', color: '#2563eb', emoji: '\uD83C\uDFC6' },
  health: { label: 'Health', color: '#dc2626', emoji: '\u2665\uFE0F' },
  education: { label: 'Education', color: '#b45309', emoji: '\uD83D\uDCDA' },
  travel: { label: 'Travel', color: '#0891b2', emoji: '\u2708\uFE0F' },
};

const OVERPASS_QUERY = (south: number, west: number, north: number, east: number) => `
[out:json][timeout:25];
(
  node["leisure"~"^(park|nature_reserve|playground|campsite)$"](${south},${west},${north},${east});
  node["amenity"~"^(restaurant|cafe|bar|fast_food|pub)$"](${south},${west},${north},${east});
  node["amenity"="place_of_worship"](${south},${west},${north},${east});
  node["amenity"~"^(museum|theatre|cinema|arts_centre)$"](${south},${west},${north},${east});
  node["leisure"~"^(stadium|fitness_centre|sports_centre|swimming_pool)$"](${south},${west},${north},${east});
  node["amenity"~"^(hospital|clinic|pharmacy)$"](${south},${west},${north},${east});
  node["amenity"~"^(school|university|library|college)$"](${south},${west},${north},${east});
  node["aeroway"="aerodrome"](${south},${west},${north},${east});
  node["railway"~"^(station|halt)$"](${south},${west},${north},${east});
  node["amenity"~"^(bus_station|hotel|hostel)$"](${south},${west},${north},${east});
);
out body;
`;

function getCategory(tags: Record<string, string>): EventCenterCategory {
  const amenity = tags.amenity ?? '';
  const leisure = tags.leisure ?? '';
  const aeroway = tags.aeroway ?? '';
  const railway = tags.railway ?? '';

  if (['restaurant', 'cafe', 'bar', 'fast_food', 'pub'].includes(amenity)) return 'food';
  if (amenity === 'place_of_worship') return 'faith';
  if (['museum', 'theatre', 'cinema', 'arts_centre'].includes(amenity)) return 'arts';
  if (['hospital', 'clinic', 'pharmacy'].includes(amenity)) return 'health';
  if (['school', 'university', 'library', 'college'].includes(amenity)) return 'education';
  if (
    ['bus_station', 'hotel', 'hostel'].includes(amenity) ||
    aeroway === 'aerodrome' ||
    ['station', 'halt'].includes(railway)
  ) {
    return 'travel';
  }
  if (['stadium', 'fitness_centre', 'sports_centre', 'swimming_pool'].includes(leisure)) return 'sports';
  if (['park', 'nature_reserve', 'playground', 'campsite'].includes(leisure)) return 'outdoors';

  return 'outdoors';
}

function createEventCenterIcon(category: EventCenterCategory): L.DivIcon {
  const { color, emoji } = CATEGORY_CONFIG[category];
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';

  const circle = document.createElement('div');
  circle.style.width = '36px';
  circle.style.height = '36px';
  circle.style.borderRadius = '50%';
  circle.style.background = color;
  circle.style.border = '3px solid #ffffff';
  circle.style.boxShadow = `0 4px 12px ${color}66`;
  circle.style.display = 'flex';
  circle.style.alignItems = 'center';
  circle.style.justifyContent = 'center';
  circle.style.fontSize = '16px';
  circle.style.lineHeight = '1';
  circle.textContent = emoji;

  const notch = document.createElement('div');
  notch.style.width = '0';
  notch.style.height = '0';
  notch.style.marginTop = '-1px';
  notch.style.borderLeft = '6px solid transparent';
  notch.style.borderRight = '6px solid transparent';
  notch.style.borderTop = `8px solid ${color}`;

  wrapper.appendChild(circle);
  wrapper.appendChild(notch);

  return L.divIcon({
    className: '',
    html: wrapper,
    iconSize: [36, 46],
    iconAnchor: [18, 44],
    popupAnchor: [0, -46],
  });
}

interface EventCenterLayerProps {
  map: L.Map;
  show: boolean;
  onPlanEvent: (center: EventCenter) => void;
  enabledCategories: EventCenterCategory[];
  onCentersLoaded: (centers: EventCenter[]) => void;
}

const MIN_ZOOM = 12;
const DEBOUNCE_MS = 800;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function EventCenterLayer({
  map,
  show,
  onPlanEvent,
  enabledCategories,
  onCentersLoaded,
}: EventCenterLayerProps) {
  const layerRef = useRef<L.LayerGroup | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [loadedCenters, setLoadedCenters] = useState<EventCenter[]>([]);

  const renderMarkers = useCallback((centers: EventCenter[], enabled: EventCenterCategory[]) => {
    layerRef.current?.clearLayers();
    const cleanupFns: Array<() => void> = [];

    for (const center of centers) {
      if (!enabled.includes(center.category)) continue;

      const { color } = CATEGORY_CONFIG[center.category];
      const icon = createEventCenterIcon(center.category);
      const marker = L.marker([center.latitude, center.longitude], { icon });
      layerRef.current?.addLayer(marker);

      const denomination = center.tags.religion ?? center.tags.denomination ?? null;
      const cuisine = center.tags.cuisine ?? null;
      const detailLine = denomination
        ? escapeHtml(denomination.charAt(0).toUpperCase() + denomination.slice(1))
        : cuisine
          ? escapeHtml(cuisine.charAt(0).toUpperCase() + cuisine.slice(1))
          : escapeHtml(CATEGORY_CONFIG[center.category].label);

      const popupEl = document.createElement('div');
      popupEl.className = 'cdb-map-popup';
      popupEl.innerHTML = `
        <div class="cdb-map-popup-header">
          <p class="cdb-map-popup-title">${escapeHtml(center.name)}</p>
        </div>
        <div class="cdb-map-popup-detail">${detailLine}</div>
      `;

      const actions = document.createElement('div');
      actions.className = 'cdb-map-popup-actions';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cdb-map-popup-button';
      btn.style.background = color;
      btn.textContent = 'Plan Event Here';
      const handleClick = () => onPlanEvent(center);
      btn.addEventListener('click', handleClick);
      cleanupFns.push(() => btn.removeEventListener('click', handleClick));
      actions.appendChild(btn);
      popupEl.appendChild(actions);
      marker.bindPopup(popupEl);
    }

    return () => {
      for (const fn of cleanupFns) fn();
    };
  }, [onPlanEvent]);

  const fetchAndRender = useCallback(async () => {
    if (!show) return;

    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM) {
      layerRef.current?.clearLayers();
      setLoadedCenters([]);
      onCentersLoaded([]);
      return;
    }

    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const west = bounds.getWest();
    const north = bounds.getNorth();
    const east = bounds.getEast();

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: OVERPASS_QUERY(south, west, north, east),
        signal: abort.signal,
      });
      if (!response.ok) {
        setLoadedCenters([]);
        onCentersLoaded([]);
        return;
      }

      const data = await response.json() as {
        elements: { id: number; lat: number; lon: number; tags?: Record<string, string> }[];
      };

      const centers: EventCenter[] = [];

      for (const el of data.elements) {
        if (!el.tags?.name) continue;

        const tags = el.tags ?? {};
        const category = getCategory(tags);
        centers.push({
          id: String(el.id),
          name: el.tags.name,
          latitude: el.lat,
          longitude: el.lon,
          category,
          tags,
        });
      }

      setLoadedCenters(centers);
      onCentersLoaded(centers);
    } catch {
      if (!abort.signal.aborted) {
        setLoadedCenters([]);
        onCentersLoaded([]);
      }
    }
  }, [map, onCentersLoaded, show]);

  useEffect(() => {
    if (!layerRef.current) return;
    const cleanup = renderMarkers(loadedCenters, enabledCategories);
    return cleanup;
  }, [enabledCategories, loadedCenters, renderMarkers]);

  const scheduleFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchAndRender(), DEBOUNCE_MS);
  }, [fetchAndRender]);

  useEffect(() => {
    if (!show) {
      layerRef.current?.remove();
      layerRef.current = null;
      return;
    }

    layerRef.current = L.layerGroup().addTo(map);
    const initialFetchId = window.setTimeout(() => void fetchAndRender(), 0);

    map.on('moveend', scheduleFetch);
    map.on('zoomend', scheduleFetch);

    return () => {
      map.off('moveend', scheduleFetch);
      map.off('zoomend', scheduleFetch);
      window.clearTimeout(initialFetchId);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      layerRef.current?.remove();
      layerRef.current = null;
    };
  }, [fetchAndRender, map, scheduleFetch, show]);

  return null;
}
